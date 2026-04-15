"""WebSocket manager — broadcast del estado a todos los jugadores conectados."""
import json
from fastapi import WebSocket
from typing import Dict, List


class WSManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, game_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(game_id, []).append(ws)

    def disconnect(self, game_id: str, ws: WebSocket):
        room = self.rooms.get(game_id, [])
        if ws in room:
            room.remove(ws)

    async def broadcast(self, game_id: str, payload: dict):
        room = self.rooms.get(game_id, [])
        dead = []
        for ws in room:
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(game_id, ws)


ws_manager = WSManager()
