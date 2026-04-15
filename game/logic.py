"""
Ludo Loco - Lógica del juego
"""
import random
from typing import Optional, Tuple
from .board_data import MAIN_PATH, PLAYER_STARTS, HOME_STRETCHES, HOME_SLOTS, SAFE_SQUARES, CENTER
from .game_state import GameState, Piece


def roll_dice() -> int:
    return random.randint(1, 6)


def abs_path_index(player: int, rel_pos: int) -> Optional[int]:
    """Convierte posición relativa (0-51) a índice absoluto en MAIN_PATH."""
    if 0 <= rel_pos <= 51:
        return (PLAYER_STARTS[player] + rel_pos) % 52
    return None


def get_cell(player: int, piece: Piece) -> Tuple[int, int]:
    """Devuelve (fila, col) del tablero para una ficha."""
    if piece.pos == -1:
        return HOME_SLOTS[player][piece.idx]
    if piece.pos <= 51:
        return MAIN_PATH[abs_path_index(player, piece.pos)]
    if piece.pos <= 56:
        return HOME_STRETCHES[player][piece.pos - 52]
    # pos == 57 → terminada, se dibuja en el centro
    return CENTER


def get_valid_moves(state: GameState) -> list:
    """Retorna lista de índices de fichas (0-3) que pueden moverse con el dado actual."""
    player = state.current_player
    dice = state.dice_value
    if dice is None:
        return []

    valid = []
    for i, piece in enumerate(state.pieces[player]):
        if piece.pos == -1:
            if dice == 6:
                valid.append(i)
        elif piece.pos <= 56:
            new_pos = piece.pos + dice
            if new_pos <= 57:
                valid.append(i)
        # pos 57 = terminada, no se mueve
    return valid


def apply_move(state: GameState, piece_idx: int) -> dict:
    """
    Aplica el movimiento con el dado actual a la ficha indicada.
    Retorna dict con eventos: captured, capture_player, extra_turn, piece_finished.
    """
    player = state.current_player
    dice = state.dice_value
    piece = state.pieces[player][piece_idx]
    events = {
        'captured': False,
        'capture_player': None,
        'extra_turn': False,
        'piece_finished': False,
    }

    # Salir de casa
    if piece.pos == -1:
        piece.pos = 0
    else:
        piece.pos += dice

    state.last_moved = (player, piece_idx)

    # ¿Llegó al centro?
    if piece.pos == 57:
        events['piece_finished'] = True
        events['extra_turn'] = True
        return events

    # Captura (solo en camino principal 0-51)
    if 0 <= piece.pos <= 51:
        my_abs = abs_path_index(player, piece.pos)
        if my_abs not in SAFE_SQUARES:
            for other_p in range(4):
                if other_p == player:
                    continue
                for other_piece in state.pieces[other_p]:
                    if 0 <= other_piece.pos <= 51:
                        their_abs = abs_path_index(other_p, other_piece.pos)
                        if their_abs == my_abs:
                            # ¡Captura!
                            other_piece.pos = -1
                            events['captured'] = True
                            events['capture_player'] = other_p
                            events['extra_turn'] = True

    # Turno extra al sacar 6 (si no capturó, ya que captura también da extra)
    if dice == 6 and not events['captured']:
        events['extra_turn'] = True

    return events


def check_win(state: GameState, player: int) -> bool:
    """Verdadero si el jugador tiene las 4 fichas terminadas."""
    return all(p.pos == 57 for p in state.pieces[player])


def advance_turn(state: GameState, extra_turn: bool = False):
    """Avanza al siguiente turno (o mismo jugador si extra_turn)."""
    state.dice_value = None
    state.valid_moves = []
    if not extra_turn:
        n = len(state.player_ids)
        state.current_player = (state.current_player + 1) % n
        state.consecutive_sixes = 0
    state.phase = 'rolling'
    state.turn_count += 1
