"""
Ludo Loco - Servidor principal
FastAPI: sirve la Mini App + API REST + WebSocket
Bot Telegram: modo webhook (notificaciones + botón abrir app)
"""
import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import uvicorn

from dotenv import load_dotenv
load_dotenv()

BOT_TOKEN = os.getenv('BOT_TOKEN', '')
RAILWAY_DOMAIN = os.getenv('RAILWAY_PUBLIC_DOMAIN', '')
PORT = int(os.getenv('PORT', 8000))

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

# ── Estado compartido ──────────────────────────────────────────────────────────
from game.game_state import GameState
active_games: dict[str, GameState] = {}

# Inyectar en routes
import api.routes as routes_module
routes_module.active_games = active_games

from api.routes import router as api_router
from api.ws_manager import ws_manager
from database.db import init_db


# ── Bot Telegram (webhook) ─────────────────────────────────────────────────────
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, ContextTypes, CallbackQueryHandler
from currency.luloco import register_player, balance, format_balance, TOKEN_NAME
from database.db import get_ranking

telegram_app: Application = None
APP_URL = f'https://{RAILWAY_DOMAIN}' if RAILWAY_DOMAIN else ''


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await register_player(user.id, user.first_name)
    bal = await balance(user.id)
    kbd = InlineKeyboardMarkup([[
        InlineKeyboardButton('🎮 Jugar Ludo Loco',
                             web_app=WebAppInfo(url=APP_URL) if APP_URL else None,
                             callback_data='no_url' if not APP_URL else None)
    ]])
    await update.message.reply_text(
        f'🎲 *¡Bienvenido a Ludo Loco!*\n\n'
        f'Parchís multijugador con moneda propia 💰\n'
        f'Token: *{TOKEN_NAME}*\n\n'
        f'Tu balance: {format_balance(bal)}\n\n'
        f'Pulsa el botón para abrir el juego:',
        parse_mode='Markdown',
        reply_markup=kbd
    )


async def cmd_billetera(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await register_player(user.id, user.first_name)
    bal = await balance(user.id)
    await update.message.reply_text(
        f'💼 *Tu billetera LULOCO*\n\n'
        f'Balance: {format_balance(bal)}',
        parse_mode='Markdown'
    )


async def cmd_ranking(update: Update, context: ContextTypes.DEFAULT_TYPE):
    rows = await get_ranking(10)
    if not rows:
        await update.message.reply_text('Sin jugadores aún.')
        return
    medals = ['🥇', '🥈', '🥉'] + ['  '] * 10
    lines = ['🏆 *Ranking LULOCO*\n']
    for i, (name, bal, wins, caps) in enumerate(rows):
        lines.append(f'{medals[i]} {i+1}. *{name or "Anón"}* — {format_balance(bal)} | 🏆{wins} | 💥{caps}')
    await update.message.reply_text('\n'.join(lines), parse_mode='Markdown')


async def cmd_jugar(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not APP_URL:
        await update.message.reply_text('El servidor web no está configurado.')
        return
    kbd = InlineKeyboardMarkup([[
        InlineKeyboardButton('🎮 Abrir Ludo Loco', web_app=WebAppInfo(url=APP_URL))
    ]])
    await update.message.reply_text('¡Pulsa para abrir el tablero!', reply_markup=kbd)


async def cb_no_url(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.callback_query.answer('Configura RAILWAY_PUBLIC_DOMAIN.', show_alert=True)


async def setup_bot():
    global telegram_app
    telegram_app = Application.builder().token(BOT_TOKEN).build()
    telegram_app.add_handler(CommandHandler('start', cmd_start))
    telegram_app.add_handler(CommandHandler('jugar', cmd_jugar))
    telegram_app.add_handler(CommandHandler('billetera', cmd_billetera))
    telegram_app.add_handler(CommandHandler('ranking', cmd_ranking))
    telegram_app.add_handler(CallbackQueryHandler(cb_no_url, pattern='no_url'))
    await telegram_app.initialize()
    await telegram_app.start()

    if RAILWAY_DOMAIN:
        webhook_url = f'{APP_URL}/webhook'
        await telegram_app.bot.set_webhook(webhook_url)
        log.info(f'Webhook configurado: {webhook_url}')
    else:
        log.warning('Sin RAILWAY_PUBLIC_DOMAIN — usa bot.py para polling local')


# ── FastAPI app ────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    if BOT_TOKEN:
        await setup_bot()
    yield
    if telegram_app:
        await telegram_app.stop()
        await telegram_app.shutdown()


app = FastAPI(lifespan=lifespan)
app.include_router(api_router, prefix='/api')


@app.post('/webhook')
async def webhook(request: Request):
    if not telegram_app:
        return JSONResponse({'ok': False})
    data = await request.json()
    update = Update.de_json(data, telegram_app.bot)
    await telegram_app.process_update(update)
    return {'ok': True}


@app.websocket('/ws/{game_id}')
async def ws_endpoint(websocket: WebSocket, game_id: str):
    await ws_manager.connect(game_id, websocket)
    try:
        while True:
            await websocket.receive_text()  # mantener viva la conexión
    except WebSocketDisconnect:
        ws_manager.disconnect(game_id, websocket)


# Servir static files (Mini App)
app.mount('/', StaticFiles(directory='static', html=True), name='static')


if __name__ == '__main__':
    uvicorn.run('main:app', host='0.0.0.0', port=PORT, reload=False)
