"""
Ludo Loco - Base de datos SQLite
"""
import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(__file__), 'ludo_loco.db')


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS wallets (
                user_id   INTEGER PRIMARY KEY,
                username  TEXT,
                balance   REAL DEFAULT 100.0,
                games_played INTEGER DEFAULT 0,
                games_won    INTEGER DEFAULT 0,
                captures     INTEGER DEFAULT 0
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id   INTEGER,
                amount    REAL,
                reason    TEXT,
                ts        DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS game_history (
                game_id   TEXT PRIMARY KEY,
                winner_id INTEGER,
                players   TEXT,
                turns     INTEGER,
                ts        DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.commit()


async def ensure_wallet(user_id: int, username: str = ''):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR IGNORE INTO wallets (user_id, username) VALUES (?, ?)
        """, (user_id, username))
        await db.commit()


async def get_balance(user_id: int) -> float:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT balance FROM wallets WHERE user_id = ?", (user_id,)
        ) as cur:
            row = await cur.fetchone()
            return row[0] if row else 0.0


async def add_balance(user_id: int, amount: float, reason: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            UPDATE wallets SET balance = balance + ? WHERE user_id = ?
        """, (amount, user_id))
        await db.execute("""
            INSERT INTO transactions (user_id, amount, reason) VALUES (?, ?, ?)
        """, (user_id, amount, reason))
        await db.commit()


async def increment_stat(user_id: int, stat: str):
    """stat: 'games_played', 'games_won', 'captures'"""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"""
            UPDATE wallets SET {stat} = {stat} + 1 WHERE user_id = ?
        """, (user_id,))
        await db.commit()


async def get_ranking(limit: int = 10) -> list:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("""
            SELECT username, balance, games_won, captures
            FROM wallets
            ORDER BY balance DESC
            LIMIT ?
        """, (limit,)) as cur:
            return await cur.fetchall()


async def save_game(game_id: str, winner_id: int, player_ids: list, turns: int):
    import json
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT OR REPLACE INTO game_history (game_id, winner_id, players, turns)
            VALUES (?, ?, ?, ?)
        """, (game_id, winner_id, json.dumps(player_ids), turns))
        await db.commit()
