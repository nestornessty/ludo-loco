"""
Ludo Loco - Estado del juego
"""
from dataclasses import dataclass, field
from typing import List, Optional, Tuple


@dataclass
class Piece:
    """Una ficha del juego.
    pos:
      -1       = en casa (no ha salido)
       0-51    = en el camino principal (relativo al inicio del jugador)
       52-56   = en el camino de llegada (52=primer cuadro, 56=último)
       57      = terminada (en el centro)
    """
    player: int     # 0-3 a qué jugador pertenece
    idx: int        # 0-3 qué ficha es del jugador
    pos: int = -1   # posición actual


@dataclass
class GameState:
    game_id: str
    chat_id: int
    message_id: Optional[int]
    player_ids: List[int]
    player_names: List[str]
    player_chat_ids: List[int]           # chat_id privado de cada jugador
    player_msg_ids: List[Optional[int]]  # message_id del tablero en cada chat
    pieces: List[List[Piece]]
    current_player: int
    dice_value: Optional[int]
    valid_moves: List[int]
    phase: str                           # 'waiting'|'rolling'|'moving'|'finished'
    winner: Optional[int]
    turn_count: int
    consecutive_sixes: int = 0
    last_moved: Optional[Tuple[int,int]] = None
    lobby_message_id: Optional[int] = None

    @classmethod
    def new(cls, game_id: str, chat_id: int) -> 'GameState':
        pieces = [
            [Piece(player=p, idx=i, pos=-1) for i in range(4)]
            for p in range(4)
        ]
        return cls(
            game_id=game_id,
            chat_id=chat_id,
            message_id=None,
            player_ids=[],
            player_names=[],
            player_chat_ids=[],
            player_msg_ids=[],
            pieces=pieces,
            current_player=0,
            dice_value=None,
            valid_moves=[],
            phase='waiting',
            winner=None,
            turn_count=0,
            consecutive_sixes=0,
            last_moved=None,
            lobby_message_id=None,
        )
