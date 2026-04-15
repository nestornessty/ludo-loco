"""
Ludo Loco - Moneda LULOCO
Gestión de balances y recompensas del token ficticio del juego.
"""
from database.db import ensure_wallet, get_balance, add_balance, increment_stat

# Recompensas en LULOCO
REWARD_WIN          = 100.0   # Ganar la partida
REWARD_CAPTURE      = 8.0     # Capturar una ficha enemiga
REWARD_PIECE_HOME   = 12.0    # Llevar una ficha al centro
REWARD_PLAY         = 5.0     # Participar en una partida (todos los jugadores)
PENALTY_LOSE        = -10.0   # Perder la partida
STARTING_BALANCE    = 100.0   # Balance inicial de nuevos usuarios

TOKEN_NAME    = 'LULOCO'
TOKEN_SYMBOL  = '💰'


async def register_player(user_id: int, username: str):
    """Registra al jugador si no existe, con balance inicial."""
    await ensure_wallet(user_id, username)


async def balance(user_id: int) -> float:
    return await get_balance(user_id)


async def reward_capture(user_id: int):
    await add_balance(user_id, REWARD_CAPTURE, 'captura_ficha')
    await increment_stat(user_id, 'captures')


async def reward_piece_finished(user_id: int):
    await add_balance(user_id, REWARD_PIECE_HOME, 'ficha_al_centro')


async def reward_game_end(winner_id: int, loser_ids: list, turns: int):
    """Distribuye LULOCO al terminar una partida."""
    await add_balance(winner_id, REWARD_WIN, 'victoria')
    await increment_stat(winner_id, 'games_won')

    for uid in loser_ids:
        await add_balance(uid, REWARD_PLAY, 'participacion')
        await increment_stat(uid, 'games_played')

    await increment_stat(winner_id, 'games_played')


def format_balance(amount: float) -> str:
    return f'{TOKEN_SYMBOL} {amount:,.1f} {TOKEN_NAME}'
