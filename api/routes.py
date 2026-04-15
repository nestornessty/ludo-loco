"""REST API endpoints para el juego."""
import json
import hmac
import hashlib
import os
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from game.game_state import GameState
from game.logic import roll_dice, get_valid_moves, apply_move, check_win, advance_turn
from game.board_data import PLAYER_EMOJIS, PLAYER_NAMES
from currency.luloco import register_player, reward_capture, reward_piece_finished, reward_game_end
from database.db import save_game
from api.ws_manager import ws_manager

router = APIRouter()

# Importado desde main.py al arrancar
active_games: dict = {}

BOT_TOKEN = os.getenv('BOT_TOKEN', '')


def verify_init_data(init_data: str) -> Optional[dict]:
    """Valida el initData de Telegram WebApp y devuelve los datos del usuario."""
    if not init_data:
        return None
    try:
        params = dict(p.split('=', 1) for p in init_data.split('&') if '=' in p)
        received_hash = params.pop('hash', '')
        data_check = '\n'.join(f'{k}={v}' for k, v in sorted(params.items()))
        secret = hmac.new(b'WebAppData', BOT_TOKEN.encode(), hashlib.sha256).digest()
        expected = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, received_hash):
            return None
        user_str = params.get('user', '{}')
        return json.loads(user_str)
    except Exception:
        return None


def get_user(init_data: str):
    user = verify_init_data(init_data)
    if not user:
        # En desarrollo permitir user_id hardcodeado via header
        return None
    return user


def state_to_dict(state: GameState) -> dict:
    return {
        'game_id': state.game_id,
        'player_ids': state.player_ids,
        'player_names': state.player_names,
        'current_player': state.current_player,
        'phase': state.phase,
        'dice_value': state.dice_value,
        'valid_moves': state.valid_moves,
        'winner': state.winner,
        'turn_count': state.turn_count,
        'pieces': [
            [{'pos': p.pos, 'player': p.player, 'idx': p.idx} for p in player_pieces]
            for player_pieces in state.pieces
        ],
    }


async def broadcast_state(state: GameState, event: str = 'update', extra: dict = None):
    payload = {'type': event, 'state': state_to_dict(state)}
    if extra:
        payload.update(extra)
    await ws_manager.broadcast(state.game_id, payload)


# ── Endpoints ──────────────────────────────────────────────────────────────────

class CreateBody(BaseModel):
    user_id: int
    user_name: str


class JoinBody(BaseModel):
    user_id: int
    user_name: str


@router.post('/games')
async def create_game(body: CreateBody):
    import random, string
    from game.game_state import GameState, Piece

    gid = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    while gid in active_games:
        gid = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

    state = GameState.new(gid, body.user_id)
    state.player_ids.append(body.user_id)
    state.player_names.append(body.user_name)
    state.player_chat_ids.append(body.user_id)
    state.player_msg_ids.append(None)
    active_games[gid] = state

    await register_player(body.user_id, body.user_name)
    return {'game_id': gid, 'state': state_to_dict(state)}


@router.post('/games/{game_id}/join')
async def join_game(game_id: str, body: JoinBody):
    state = active_games.get(game_id)
    if not state:
        raise HTTPException(404, 'Sala no encontrada')
    if state.phase != 'waiting':
        raise HTTPException(400, 'La partida ya comenzó')
    if body.user_id in state.player_ids:
        return {'game_id': game_id, 'state': state_to_dict(state)}
    if len(state.player_ids) >= 4:
        raise HTTPException(400, 'Sala llena')

    state.player_ids.append(body.user_id)
    state.player_names.append(body.user_name)
    state.player_chat_ids.append(body.user_id)
    state.player_msg_ids.append(None)

    await register_player(body.user_id, body.user_name)
    await broadcast_state(state, 'player_joined')

    if len(state.player_ids) == 4:
        state.phase = 'rolling'
        await broadcast_state(state, 'game_started')

    return {'game_id': game_id, 'state': state_to_dict(state)}


@router.get('/games/{game_id}')
async def get_game(game_id: str):
    state = active_games.get(game_id)
    if not state:
        raise HTTPException(404, 'Sala no encontrada')
    return state_to_dict(state)


@router.post('/games/{game_id}/start')
async def start_game(game_id: str, body: JoinBody):
    state = active_games.get(game_id)
    if not state:
        raise HTTPException(404, 'Sala no encontrada')
    if state.phase != 'waiting':
        raise HTTPException(400, 'La partida ya comenzó')
    if body.user_id not in state.player_ids:
        raise HTTPException(403, 'No estás en esta sala')
    if len(state.player_ids) < 2:
        raise HTTPException(400, 'Necesitas al menos 2 jugadores')

    state.phase = 'rolling'
    await broadcast_state(state, 'game_started')
    return state_to_dict(state)


class RollBody(BaseModel):
    user_id: int


@router.post('/games/{game_id}/roll')
async def roll(game_id: str, body: RollBody):
    state = active_games.get(game_id)
    if not state:
        raise HTTPException(404, 'Sala no encontrada')
    if state.phase != 'rolling':
        raise HTTPException(400, 'No es momento de tirar')

    cp = state.current_player
    if state.player_ids[cp] != body.user_id:
        raise HTTPException(403, 'No es tu turno')

    dice = roll_dice()
    state.dice_value = dice

    if dice == 6:
        state.consecutive_sixes += 1
    else:
        state.consecutive_sixes = 0

    note = None
    if state.consecutive_sixes >= 3:
        state.consecutive_sixes = 0
        if state.last_moved:
            lp, li = state.last_moved
            state.pieces[lp][li].pos = -1
            note = f'⚠️ ¡3 seises seguidos! Ficha {li+1} vuelve a casa.'
        advance_turn(state, extra_turn=False)
        await broadcast_state(state, 'rolled', {'dice': dice, 'note': note})
        return {**state_to_dict(state), 'dice': dice, 'note': note}

    valid = get_valid_moves(state)
    state.valid_moves = valid

    if not valid:
        advance_turn(state, extra_turn=False)
        await broadcast_state(state, 'rolled', {'dice': dice, 'note': 'Sin movimientos.'})
        return {**state_to_dict(state), 'dice': dice, 'note': 'Sin movimientos.'}

    state.phase = 'moving'
    await broadcast_state(state, 'rolled', {'dice': dice})
    return {**state_to_dict(state), 'dice': dice}


class MoveBody(BaseModel):
    user_id: int


@router.post('/games/{game_id}/move/{piece_idx}')
async def move_piece(game_id: str, piece_idx: int, body: MoveBody):
    state = active_games.get(game_id)
    if not state:
        raise HTTPException(404, 'Sala no encontrada')
    if state.phase != 'moving':
        raise HTTPException(400, 'No es momento de mover')

    cp = state.current_player
    if state.player_ids[cp] != body.user_id:
        raise HTTPException(403, 'No es tu turno')
    if piece_idx not in state.valid_moves:
        raise HTTPException(400, 'Movimiento inválido')

    events = apply_move(state, piece_idx)
    uid = state.player_ids[cp]

    if events['captured']:
        await reward_capture(uid)
    if events['piece_finished']:
        await reward_piece_finished(uid)

    if check_win(state, cp):
        state.phase = 'finished'
        state.winner = cp
        loser_ids = [state.player_ids[i] for i in range(len(state.player_ids)) if i != cp]
        await reward_game_end(uid, loser_ids, state.turn_count)
        await save_game(game_id, uid, state.player_ids, state.turn_count)
        await broadcast_state(state, 'game_over', {'winner': cp, 'winner_name': state.player_names[cp]})
        del active_games[game_id]
        return {**state_to_dict(state), 'events': events}

    advance_turn(state, extra_turn=events['extra_turn'])
    await broadcast_state(state, 'moved', {'events': events})
    return {**state_to_dict(state), 'events': events}
