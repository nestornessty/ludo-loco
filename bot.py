"""
Ludo Loco - Bot de Telegram
4 jugadores reales por tablero, moneda LULOCO ficticia.
"""
import os
import random
import string
import logging
from io import BytesIO

from dotenv import load_dotenv
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup, InputMediaPhoto
)
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, ContextTypes
)

from game.board_data import PLAYER_EMOJIS, PLAYER_NAMES
from game.game_state import GameState
from game.logic import roll_dice, get_valid_moves, apply_move, check_win, advance_turn
from graphics.renderer import render_board
from database.db import init_db
from currency.luloco import (
    register_player, balance, reward_capture, reward_piece_finished,
    reward_game_end, format_balance, TOKEN_NAME
)

load_dotenv()
BOT_TOKEN = os.getenv('BOT_TOKEN', '')

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
log = logging.getLogger(__name__)

# ── Almacenamiento en memoria ──────────────────────────────────────────────────
# game_id → GameState (salas activas)
active_games: dict[str, GameState] = {}

DICE_EMOJI = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']


def gen_game_id(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    while True:
        gid = ''.join(random.choices(chars, k=length))
        if gid not in active_games:
            return gid


async def send_board(
    context: ContextTypes.DEFAULT_TYPE,
    state: GameState,
    caption: str,
    keyboard: InlineKeyboardMarkup,
    chat_id: int = None,
    edit_message_id: int = None,
):
    """Envía o edita el mensaje del tablero con imagen PNG."""
    img = render_board(state)
    bio = BytesIO()
    img.save(bio, format='PNG', optimize=True)
    bio.seek(0)

    if edit_message_id:
        try:
            await context.bot.edit_message_media(
                chat_id=chat_id or state.chat_id,
                message_id=edit_message_id,
                media=InputMediaPhoto(bio, caption=caption, parse_mode='Markdown'),
            )
            await context.bot.edit_message_reply_markup(
                chat_id=chat_id or state.chat_id,
                message_id=edit_message_id,
                reply_markup=keyboard,
            )
            return edit_message_id
        except Exception:
            pass  # Si falla editar, enviamos uno nuevo

    msg = await context.bot.send_photo(
        chat_id=chat_id or state.chat_id,
        photo=bio,
        caption=caption,
        parse_mode='Markdown',
        reply_markup=keyboard,
    )
    return msg.message_id


def turn_keyboard(game_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton('🎲 Tirar dado', callback_data=f'r:{game_id}')
    ]])


def move_keyboard(game_id: str, valid_moves: list, state: GameState) -> InlineKeyboardMarkup:
    p = state.current_player
    buttons = []
    for idx in valid_moves:
        piece = state.pieces[p][idx]
        if piece.pos == -1:
            label = f'Ficha {idx+1} 🏠→salir'
        elif piece.pos <= 51:
            label = f'Ficha {idx+1} (cas.{piece.pos})'
        else:
            label = f'Ficha {idx+1} (llegada)'
        buttons.append(InlineKeyboardButton(label, callback_data=f'm:{game_id}:{idx}'))
    # Máximo 2 botones por fila
    rows = [buttons[i:i+2] for i in range(0, len(buttons), 2)]
    return InlineKeyboardMarkup(rows)


def lobby_keyboard(game_id: str, can_start: bool = False) -> InlineKeyboardMarkup:
    buttons = [InlineKeyboardButton('✅ Unirse a esta sala', callback_data=f'j:{game_id}')]
    rows = [buttons]
    if can_start:
        rows.append([InlineKeyboardButton('🚀 Iniciar ya', callback_data=f's:{game_id}')])
    return InlineKeyboardMarkup(rows)


def players_list(state: GameState) -> str:
    lines = []
    for i, name in enumerate(state.player_names):
        lines.append(f'{PLAYER_EMOJIS[i]} {name}')
    return '\n'.join(lines)


# ── /start ─────────────────────────────────────────────────────────────────────
async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await register_player(user.id, user.first_name)
    bal = await balance(user.id)

    await update.message.reply_text(
        f'🎲 *¡Bienvenido a Ludo Loco!*\n\n'
        f'El Parchís de Telegram con moneda propia 💰\n'
        f'Token: *{TOKEN_NAME}* — ficticio, ¡por ahora! 😏\n\n'
        f'Tu balance: {format_balance(bal)}\n\n'
        f'*Comandos:*\n'
        f'`/nueva` — Crear sala (4 jugadores)\n'
        f'`/unir CÓDIGO` — Unirte a una sala\n'
        f'`/billetera` — Ver tu balance\n'
        f'`/ranking` — Top jugadores\n'
        f'`/reglas` — Cómo se juega',
        parse_mode='Markdown',
        reply_markup=InlineKeyboardMarkup([[
            InlineKeyboardButton('🆕 Crear sala', callback_data='menu:nueva'),
        ]])
    )


# ── /nueva ─────────────────────────────────────────────────────────────────────
async def cmd_nueva(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await register_player(user.id, user.first_name)
    chat_id = update.effective_chat.id

    game_id = gen_game_id()
    state = GameState.new(game_id, chat_id)
    state.player_ids.append(user.id)
    state.player_names.append(user.first_name)
    active_games[game_id] = state

    await update.message.reply_text(
        f'🎲 *Sala creada!*\n\n'
        f'Código: `{game_id}`\n'
        f'Jugadores (1/4):\n'
        f'{PLAYER_EMOJIS[0]} {user.first_name}\n\n'
        f'⏳ Mínimo 2 jugadores para empezar (máx. 4)\n'
        f'Comparte el código o usa el botón:',
        parse_mode='Markdown',
        reply_markup=lobby_keyboard(game_id, can_start=False)
    )


# ── /unir ──────────────────────────────────────────────────────────────────────
async def cmd_unir(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if not args:
        await update.message.reply_text('Uso: `/unir CÓDIGO`', parse_mode='Markdown')
        return
    await _join_game(update, context, args[0].upper().strip())


async def _join_game(update_or_query, context, game_id: str, is_callback: bool = False):
    if is_callback:
        user = update_or_query.from_user
        chat_id = update_or_query.message.chat_id
    else:
        user = update_or_query.effective_user
        chat_id = update_or_query.effective_chat.id

    await register_player(user.id, user.first_name)

    state = active_games.get(game_id)
    if not state:
        msg = f'Sala `{game_id}` no encontrada o ya terminó.'
        if is_callback:
            await update_or_query.answer(msg, show_alert=True)
        else:
            await update_or_query.message.reply_text(msg, parse_mode='Markdown')
        return

    if state.phase != 'waiting':
        msg = 'Esta partida ya ha comenzado.'
        if is_callback:
            await update_or_query.answer(msg, show_alert=True)
        else:
            await update_or_query.message.reply_text(msg)
        return

    if user.id in state.player_ids:
        msg = 'Ya estás en esta sala.'
        if is_callback:
            await update_or_query.answer(msg, show_alert=True)
        else:
            await update_or_query.message.reply_text(msg)
        return

    if len(state.player_ids) >= 4:
        msg = '¡La sala está llena!'
        if is_callback:
            await update_or_query.answer(msg, show_alert=True)
        else:
            await update_or_query.message.reply_text(msg)
        return

    state.player_ids.append(user.id)
    state.player_names.append(user.first_name)

    if is_callback:
        await update_or_query.answer(f'✅ ¡Te uniste como {PLAYER_EMOJIS[len(state.player_ids)-1]}!')

    n = len(state.player_ids)

    if n == 4:
        # Sala llena — iniciar automáticamente
        await _start_game(context, state, game_id)
        if is_callback:
            try:
                await update_or_query.edit_message_text(
                    f'✅ Sala `{game_id}` — ¡La partida comenzó!',
                    parse_mode='Markdown'
                )
            except Exception:
                pass
    else:
        # Actualizar lobby — mostrar botón "Iniciar ya" si hay 2+ jugadores
        can_start = n >= 2
        faltantes = 4 - n
        new_text = (
            f'🎲 *Sala: {game_id}*\n\n'
            f'Jugadores ({n}/4):\n'
            f'{players_list(state)}\n\n'
            + (f'✅ ¡Listo para jugar! Puedes iniciar ya o esperar hasta 4.\n'
               f'Faltan {faltantes} jugador(es) para llenar la sala.'
               if can_start else
               f'⏳ Esperando al menos 1 jugador más...')
        )
        if is_callback:
            try:
                await update_or_query.edit_message_text(
                    new_text,
                    parse_mode='Markdown',
                    reply_markup=lobby_keyboard(game_id, can_start=can_start)
                )
            except Exception:
                pass
        else:
            await update_or_query.message.reply_text(
                new_text,
                parse_mode='Markdown',
                reply_markup=lobby_keyboard(game_id, can_start=can_start)
            )


async def _start_game(context, state: GameState, game_id: str):
    """Inicia la partida con los jugadores actuales (mínimo 2)."""
    state.phase = 'rolling'
    p0 = state.player_names[0]
    n = len(state.player_ids)
    caption = (
        f'🎮 *¡Ludo Loco ha comenzado!* ({n} jugadores)\n\n'
        f'{players_list(state)}\n\n'
        f'Turno: {PLAYER_EMOJIS[0]} *{p0}*\n'
        f'Tira el dado para empezar:'
    )
    mid = await send_board(context, state, caption, turn_keyboard(game_id),
                           chat_id=state.chat_id)
    state.message_id = mid


# ── /billetera ─────────────────────────────────────────────────────────────────
async def cmd_billetera(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await register_player(user.id, user.first_name)
    bal = await balance(user.id)
    await update.message.reply_text(
        f'💼 *Tu billetera LULOCO*\n\n'
        f'👤 {user.first_name}\n'
        f'Balance: {format_balance(bal)}\n\n'
        f'_El token LULOCO es ficticio por ahora._\n'
        f'_¡Pronto en blockchain real!_ 🚀',
        parse_mode='Markdown'
    )


# ── /ranking ───────────────────────────────────────────────────────────────────
async def cmd_ranking(update: Update, context: ContextTypes.DEFAULT_TYPE):
    from database.db import get_ranking
    rows = await get_ranking(10)
    if not rows:
        await update.message.reply_text('Aún no hay jugadores registrados.')
        return

    lines = ['🏆 *Ranking LULOCO*\n']
    medals = ['🥇','🥈','🥉'] + ['  '] * 10
    for i, (username, bal, wins, caps) in enumerate(rows):
        lines.append(
            f'{medals[i]} {i+1}. *{username or "Anónimo"}*\n'
            f'   {format_balance(bal)} | 🏆{wins} victorias | 💥{caps} capturas'
        )
    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')


# ── /reglas ────────────────────────────────────────────────────────────────────
async def cmd_reglas(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        '📜 *Reglas de Ludo Loco*\n\n'
        '🎯 *Objetivo:* Llevar tus 4 fichas al centro antes que los demás.\n\n'
        '🎲 *Turnos:*\n'
        '• Tira el dado — necesitas un 6 para sacar fichas de casa.\n'
        '• Mueve la ficha que elijas el número de casillas indicado.\n'
        '• Sacar un 6 = turno extra.\n\n'
        '💥 *Capturas:*\n'
        '• Si caes en una casilla ocupada por un enemigo (sin ser segura), ¡lo mandas a su casa!\n'
        '• Capturar = turno extra + 💰8 LULOCO.\n\n'
        '⭐ *Casillas seguras:*\n'
        '• Las casillas con estrella son seguras — nadie puede ser capturado allí.\n\n'
        '⚠️ *Regla de los 3 seises:*\n'
        '• Si sacas tres seises seguidos, la última ficha movida vuelve a casa.\n\n'
        '💰 *LULOCO Recompensas:*\n'
        '• Ganar partida: +100 LULOCO\n'
        '• Ficha al centro: +12 LULOCO\n'
        '• Captura: +8 LULOCO\n'
        '• Participar: +5 LULOCO',
        parse_mode='Markdown'
    )


# ── Callbacks ──────────────────────────────────────────────────────────────────
async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data

    if data.startswith('menu:'):
        cmd = data[5:]
        if cmd == 'nueva':
            # Simular comando /nueva
            update.effective_chat = query.message.chat
            update.effective_user = query.from_user
            # Crear sala directamente
            await _handle_nueva_from_callback(query, context)
        return

    if data.startswith('j:'):
        game_id = data[2:]
        await _join_game(query, context, game_id, is_callback=True)
        return

    if data.startswith('s:'):
        game_id = data[2:]
        state = active_games.get(game_id)
        if not state:
            await query.answer('Sala no encontrada.', show_alert=True)
            return
        if state.phase != 'waiting':
            await query.answer('La partida ya comenzó.', show_alert=True)
            return
        if query.from_user.id != state.player_ids[0]:
            await query.answer('Solo el creador de la sala puede iniciar.', show_alert=True)
            return
        if len(state.player_ids) < 2:
            await query.answer('Necesitas al menos 2 jugadores.', show_alert=True)
            return
        await query.answer('¡Iniciando partida!')
        await _start_game(context, state, game_id)
        try:
            await query.edit_message_text(
                f'✅ Sala `{game_id}` — ¡La partida comenzó con {len(state.player_ids)} jugadores!',
                parse_mode='Markdown'
            )
        except Exception:
            pass
        return

    if data.startswith('r:'):
        await _handle_roll(query, context, data[2:])
        return

    if data.startswith('m:'):
        parts = data.split(':')
        await _handle_move(query, context, parts[1], int(parts[2]))
        return


async def _handle_nueva_from_callback(query, context):
    user = query.from_user
    await register_player(user.id, user.first_name)
    chat_id = query.message.chat_id

    game_id = gen_game_id()
    state = GameState.new(game_id, chat_id)
    state.player_ids.append(user.id)
    state.player_names.append(user.first_name)
    active_games[game_id] = state

    await query.answer('¡Sala creada!')
    await context.bot.send_message(
        chat_id=chat_id,
        text=(
            f'🎲 *Sala creada!*\n\n'
            f'Código: `{game_id}`\n'
            f'Jugadores (1/4):\n'
            f'{PLAYER_EMOJIS[0]} {user.first_name}\n\n'
            f'⏳ Esperando 3 jugadores más...\n'
            f'Usa el botón para unirte:'
        ),
        parse_mode='Markdown',
        reply_markup=lobby_keyboard(game_id)
    )


async def _handle_roll(query, context, game_id: str):
    user = query.from_user
    state = active_games.get(game_id)

    if not state:
        await query.answer('❌ Juego no encontrado.', show_alert=True)
        return

    if state.phase != 'rolling':
        await query.answer('⏳ No es momento de tirar.', show_alert=True)
        return

    cp = state.current_player
    if user.id != state.player_ids[cp]:
        await query.answer(
            f'No es tu turno. Espera a {state.player_names[cp]}.', show_alert=True
        )
        return

    await query.answer()

    dice = roll_dice()
    state.dice_value = dice

    # Regla de 3 seises consecutivos
    if dice == 6:
        state.consecutive_sixes += 1
    else:
        state.consecutive_sixes = 0

    if state.consecutive_sixes >= 3:
        state.consecutive_sixes = 0
        # Última ficha movida vuelve a casa
        extra_note = ''
        if state.last_moved:
            lp, li = state.last_moved
            state.pieces[lp][li].pos = -1
            extra_note = (
                f'\n⚠️ ¡3 seises seguidos! '
                f'Ficha {li+1} de {state.player_names[lp]} vuelve a casa.'
            )
        advance_turn(state, extra_turn=False)
        cp_new = state.current_player
        caption = (
            f'🎮 *Ludo Loco*\n\n'
            f'{PLAYER_EMOJIS[cp]} {state.player_names[cp]} sacó '
            f'{DICE_EMOJI[dice-1]} **{dice}**{extra_note}\n\n'
            f'Turno: {PLAYER_EMOJIS[cp_new]} *{state.player_names[cp_new]}*'
        )
        state.message_id = await send_board(
            context, state, caption, turn_keyboard(game_id),
            chat_id=state.chat_id, edit_message_id=state.message_id
        )
        return

    valid = get_valid_moves(state)
    state.valid_moves = valid

    cp_emoji = PLAYER_EMOJIS[cp]
    cp_name = state.player_names[cp]
    dice_str = f'{DICE_EMOJI[dice-1]} **{dice}**'

    if not valid:
        # Sin movimientos posibles → siguiente turno
        caption = (
            f'🎮 *Ludo Loco*\n\n'
            f'{cp_emoji} {cp_name} sacó {dice_str}\n'
            f'😔 Sin movimientos posibles. Pasa turno.\n\n'
        )
        advance_turn(state, extra_turn=False)
        cp_new = state.current_player
        caption += f'Turno: {PLAYER_EMOJIS[cp_new]} *{state.player_names[cp_new]}*'
        state.message_id = await send_board(
            context, state, caption, turn_keyboard(game_id),
            chat_id=state.chat_id, edit_message_id=state.message_id
        )
        return

    state.phase = 'moving'
    caption = (
        f'🎮 *Ludo Loco*\n\n'
        f'{cp_emoji} *{cp_name}* sacó {dice_str}\n'
        f'Elige qué ficha mover:'
    )
    state.message_id = await send_board(
        context, state, caption,
        move_keyboard(game_id, valid, state),
        chat_id=state.chat_id, edit_message_id=state.message_id
    )


async def _handle_move(query, context, game_id: str, piece_idx: int):
    user = query.from_user
    state = active_games.get(game_id)

    if not state:
        await query.answer('❌ Juego no encontrado.', show_alert=True)
        return

    if state.phase != 'moving':
        await query.answer('Espera — no es momento de mover.', show_alert=True)
        return

    cp = state.current_player
    if user.id != state.player_ids[cp]:
        await query.answer('No es tu turno.', show_alert=True)
        return

    if piece_idx not in state.valid_moves:
        await query.answer('Movimiento inválido.', show_alert=True)
        return

    await query.answer()

    cp_emoji = PLAYER_EMOJIS[cp]
    cp_name = state.player_names[cp]

    events = apply_move(state, piece_idx)

    # Recompensas LULOCO
    uid = state.player_ids[cp]
    if events['captured']:
        await reward_capture(uid)
    if events['piece_finished']:
        await reward_piece_finished(uid)

    # Comprobar victoria
    if check_win(state, cp):
        state.phase = 'finished'
        state.winner = cp

        loser_ids = [
            state.player_ids[i]
            for i in range(len(state.player_ids))
            if i != cp
        ]
        await reward_game_end(uid, loser_ids, state.turn_count)

        from database.db import save_game
        await save_game(game_id, uid, state.player_ids, state.turn_count)

        bal = await balance(uid)
        caption = (
            f'🏆 *¡{cp_emoji} {cp_name} GANA!*\n\n'
            f'¡Todas las fichas en casa!\n\n'
            f'+100 {format_balance(100)} ganados\n'
            f'Balance: {format_balance(bal)}\n\n'
            f'*Jugadores:*\n{players_list(state)}\n\n'
            f'Turnos: {state.turn_count}'
        )
        await send_board(
            context, state, caption,
            InlineKeyboardMarkup([]),
            chat_id=state.chat_id, edit_message_id=state.message_id
        )
        del active_games[game_id]
        return

    # Construir notas de eventos
    notes = ''
    if events['captured']:
        ep = events['capture_player']
        notes += f'\n💥 ¡Ficha de {PLAYER_EMOJIS[ep]} {state.player_names[ep]} capturada! +8 LULOCO'
    if events['piece_finished']:
        notes += f'\n🎯 ¡Ficha {piece_idx+1} llegó al centro! +12 LULOCO'
    if events['extra_turn'] and not check_win(state, cp):
        notes += f'\n🔄 ¡Turno extra!'

    extra = events['extra_turn']
    advance_turn(state, extra_turn=extra)
    cp_new = state.current_player

    caption = (
        f'🎮 *Ludo Loco*{notes}\n\n'
        f'Turno: {PLAYER_EMOJIS[cp_new]} *{state.player_names[cp_new]}*'
    )
    state.message_id = await send_board(
        context, state, caption, turn_keyboard(game_id),
        chat_id=state.chat_id, edit_message_id=state.message_id
    )


# ── Main ───────────────────────────────────────────────────────────────────────
async def post_init(application: Application):
    await init_db()
    log.info('Base de datos inicializada.')


def main():
    if not BOT_TOKEN:
        raise ValueError(
            'Falta BOT_TOKEN en .env\n'
            'Crea tu bot con @BotFather en Telegram y añade el token al .env'
        )

    app = (
        Application.builder()
        .token(BOT_TOKEN)
        .post_init(post_init)
        .build()
    )

    app.add_handler(CommandHandler('start', cmd_start))
    app.add_handler(CommandHandler('nueva', cmd_nueva))
    app.add_handler(CommandHandler('unir', cmd_unir))
    app.add_handler(CommandHandler('billetera', cmd_billetera))
    app.add_handler(CommandHandler('ranking', cmd_ranking))
    app.add_handler(CommandHandler('reglas', cmd_reglas))
    app.add_handler(CallbackQueryHandler(on_callback))

    log.info('🎲 Ludo Loco bot iniciado!')
    app.run_polling(drop_pending_updates=True)


if __name__ == '__main__':
    main()
