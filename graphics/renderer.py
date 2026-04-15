"""
Ludo Loco - Renderizador del tablero con PIL
Usa supersampling 2x para bordes suaves (antialiasing manual).
"""
from PIL import Image, ImageDraw, ImageFilter
import math
import os
from game.board_data import (
    MAIN_PATH, HOME_STRETCHES, HOME_SLOTS, CENTER,
    PLAYER_STARTS, SAFE_SQUARES,
    PLAYER_COLORS, PLAYER_DARK, PLAYER_LIGHT, PLAYER_NAMES,
    PLAYER_EMOJIS, PLAYER_HOME_AREA,
)
from game.logic import get_cell

# Render a 2x resolución y se escala a 1x (supersampling)
SCALE = 2
CELL = 46 * SCALE          # 92 px por celda (supersampled)
MARGIN = 24 * SCALE         # 48 px margen
BOARD_PX = 15 * CELL        # 1380 px tablero
INFO_H = 130 * SCALE        # 260 px panel inferior
IMG_W = BOARD_PX + 2 * MARGIN
IMG_H = BOARD_PX + 2 * MARGIN + INFO_H

# Tamaños finales (después de escalar)
OUT_W = IMG_W // SCALE
OUT_H = IMG_H // SCALE

# Paleta de colores
C_FRAME       = '#2A1608'
C_BOARD_BG    = '#F2E0BC'
C_NORMAL      = '#FAFAFA'
C_BORDER      = '#BBBBBB'
C_SAFE_BG     = '#FFFBE0'
C_STAR        = '#FFD700'
C_CENTER_BG   = '#E8E8E8'
C_TEXT_LIGHT  = '#EEEEEE'
C_TEXT_DARK   = '#111111'
C_INFO_BG     = '#1A0D05'


def _hex(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def _rgb_to_hex(r, g, b):
    return f'#{int(r):02X}{int(g):02X}{int(b):02X}'


def _lighten(hex_color, factor=0.45):
    r, g, b = _hex(hex_color)
    r = r + (255 - r) * factor
    g = g + (255 - g) * factor
    b = b + (255 - b) * factor
    return _rgb_to_hex(r, g, b)


def _darken(hex_color, factor=0.25):
    r, g, b = _hex(hex_color)
    r = r * (1 - factor)
    g = g * (1 - factor)
    b = b * (1 - factor)
    return _rgb_to_hex(r, g, b)


def _cell_rect(row, col):
    x = MARGIN + col * CELL
    y = MARGIN + row * CELL
    return (x, y, x + CELL - 1, y + CELL - 1)


def _cell_cx(row, col):
    return MARGIN + col * CELL + CELL // 2, MARGIN + row * CELL + CELL // 2


def _draw_star(draw, cx, cy, r, color):
    pts = []
    for i in range(10):
        angle = math.radians(i * 36 - 90)
        rad = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rad * math.cos(angle), cy + rad * math.sin(angle)))
    draw.polygon(pts, fill=color, outline=color)


def _draw_circle(draw, cx, cy, r, fill, outline=None, width=2):
    draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=fill,
                 outline=outline or fill, width=width)


def _draw_text_centered(draw, cx, cy, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    w = bbox[2] - bbox[0]
    h = bbox[3] - bbox[1]
    draw.text((cx - w//2, cy - h//2), text, font=font, fill=fill)


def _load_font(size):
    from PIL import ImageFont
    candidates = [
        'C:/Windows/Fonts/arialbd.ttf',
        'C:/Windows/Fonts/arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/System/Library/Fonts/Helvetica.ttc',
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()


# Cache de fuentes
_fonts = {}


def _font(size):
    if size not in _fonts:
        _fonts[size] = _load_font(size)
    return _fonts[size]


def render_board(state) -> Image.Image:
    """Renderiza el tablero completo como imagen PIL. Devuelve imagen a resolución normal."""
    img = Image.new('RGB', (IMG_W, IMG_H), C_FRAME)
    draw = ImageDraw.Draw(img)

    # ── 1. Fondo del tablero ──────────────────────────────────────────────────
    draw.rectangle(
        [MARGIN, MARGIN, MARGIN + BOARD_PX, MARGIN + BOARD_PX],
        fill=C_BOARD_BG
    )

    # ── 2. Áreas de casa (esquinas) ───────────────────────────────────────────
    for p, (r1, c1, r2, c2) in enumerate(PLAYER_HOME_AREA):
        light = _lighten(PLAYER_COLORS[p], 0.55)
        x1, y1 = MARGIN + c1*CELL, MARGIN + r1*CELL
        x2, y2 = MARGIN + (c2+1)*CELL, MARGIN + (r2+1)*CELL
        draw.rectangle([x1, y1, x2, y2], fill=light)

        # Corral interior
        pad = int(CELL * 0.55)
        inner_color = _lighten(PLAYER_COLORS[p], 0.2)
        draw.rectangle(
            [x1+pad, y1+pad, x2-pad, y2-pad],
            fill=inner_color,
            outline=PLAYER_DARK[p],
            width=max(2, SCALE*2)
        )

        # Nombre del color en la esquina
        font_home = _font(int(CELL * 0.18))
        name_x = (x1 + x2) // 2
        name_y = y1 + int(CELL * 0.25)
        _draw_text_centered(draw, name_x, name_y, PLAYER_NAMES[p], font_home, PLAYER_DARK[p])

        # Slots de fichas en casa (círculos grises)
        for slot_r, slot_c in HOME_SLOTS[p]:
            scx, scy = _cell_cx(slot_r, slot_c)
            slot_r_size = int(CELL * 0.35)
            _draw_circle(draw, scx, scy, slot_r_size, '#D0D0D0',
                         outline=PLAYER_DARK[p], width=max(2, SCALE*2))

    # ── 3. Fondo de la cruz (camino) ──────────────────────────────────────────
    # Brazo horizontal: filas 6-8
    draw.rectangle(
        [MARGIN, MARGIN + 6*CELL, MARGIN + BOARD_PX, MARGIN + 9*CELL],
        fill=C_NORMAL
    )
    # Brazo vertical: cols 6-8
    draw.rectangle(
        [MARGIN + 6*CELL, MARGIN, MARGIN + 9*CELL, MARGIN + BOARD_PX],
        fill=C_NORMAL
    )

    # ── 4. Caminos de llegada (coloreados sobre la cruz) ──────────────────────
    for p in range(4):
        home_color = _lighten(PLAYER_COLORS[p], 0.35)
        for sq in HOME_STRETCHES[p]:
            r, c = sq
            rect = _cell_rect(r, c)
            draw.rectangle(rect, fill=home_color, outline=PLAYER_COLORS[p], width=SCALE)

    # ── 5. Centro (rehilete de 4 triángulos) ──────────────────────────────────
    cx1 = MARGIN + 6*CELL
    cy1 = MARGIN + 6*CELL
    cx2 = MARGIN + 9*CELL
    cy2 = MARGIN + 9*CELL
    cxm = (cx1 + cx2) // 2
    cym = (cy1 + cy2) // 2
    # 4 triángulos, uno por jugador
    triangles = [
        [(cxm, cym), (cx1, cy1), (cx2, cy1)],  # Superior - Amarillo
        [(cxm, cym), (cx2, cy1), (cx2, cy2)],  # Derecha   - Verde
        [(cxm, cym), (cx1, cy2), (cx2, cy2)],  # Inferior  - Rojo
        [(cxm, cym), (cx1, cy1), (cx1, cy2)],  # Izquierda - Azul
    ]
    for p, tri in enumerate(triangles):
        draw.polygon(tri, fill=PLAYER_COLORS[p])
    # Borde blanco entre triángulos
    for tri in triangles:
        draw.line([tri[0], tri[1]], fill='white', width=SCALE*2)
        draw.line([tri[0], tri[2]], fill='white', width=SCALE*2)
    # Estrella central
    _draw_star(draw, cxm, cym, int(CELL * 0.28), 'white')

    # ── 6. Casillas del camino principal (bordes + marcadores) ───────────────
    start_set = set(PLAYER_STARTS)
    for i, (r, c) in enumerate(MAIN_PATH):
        rect = _cell_rect(r, c)
        sqcx, sqcy = _cell_cx(r, c)

        if i in start_set:
            # Casilla de salida — color del jugador
            p_idx = PLAYER_STARTS.index(i)
            sq_color = _lighten(PLAYER_COLORS[p_idx], 0.25)
            draw.rectangle(rect, fill=sq_color, outline=PLAYER_DARK[p_idx], width=SCALE)
            _draw_star(draw, sqcx, sqcy, int(CELL * 0.2), PLAYER_COLORS[p_idx])
        elif i in SAFE_SQUARES:
            # Casilla segura — fondo claro + estrella dorada
            draw.rectangle(rect, fill=C_SAFE_BG, outline=C_BORDER, width=SCALE)
            _draw_star(draw, sqcx, sqcy, int(CELL * 0.2), C_STAR)
        else:
            # Casilla normal
            draw.rectangle(rect, fill=C_NORMAL, outline=C_BORDER, width=SCALE)

    # ── 7. Fichas ─────────────────────────────────────────────────────────────
    if state.player_ids:
        # Agrupar fichas por celda para apilarlas si coinciden
        cell_map: dict = {}
        for p in range(len(state.player_ids)):
            for piece in state.pieces[p]:
                cell = get_cell(p, piece)
                key = cell
                if key not in cell_map:
                    cell_map[key] = []
                cell_map[key].append((p, piece))

        for (r, c), pieces_in_cell in cell_map.items():
            bcx, bcy = _cell_cx(r, c)
            count = len(pieces_in_cell)
            piece_r = max(int(CELL * 0.28), SCALE * 6)
            if count > 1:
                piece_r = max(int(CELL * 0.22), SCALE * 5)

            offsets = [(0,0)]
            if count > 1:
                off = int(CELL * 0.22)
                offsets = [(-off,-off),(off,-off),(-off,off),(off,off)]

            for idx, (p, piece) in enumerate(pieces_in_cell):
                ox, oy = offsets[min(idx, 3)]
                pcx, pcy = bcx + ox, bcy + oy

                # Sombra
                _draw_circle(draw, pcx+SCALE*2, pcy+SCALE*2, piece_r,
                             fill='#22222266' if False else '#444444')
                # Cuerpo de la ficha
                _draw_circle(draw, pcx, pcy, piece_r,
                             fill=PLAYER_COLORS[p],
                             outline=PLAYER_DARK[p],
                             width=max(2, SCALE*2))
                # Brillo (highlight)
                h_r = max(piece_r//3, SCALE*2)
                h_off = piece_r // 3
                _draw_circle(draw, pcx - h_off, pcy - h_off, h_r,
                             fill='#FFFFFF88' if False else '#FFFFFFAA')
                # Número de ficha
                font_piece = _font(int(piece_r * 1.1))
                _draw_text_centered(draw, pcx, pcy, str(piece.idx+1),
                                    font_piece, 'white')

    # ── 8. Panel de información inferior ─────────────────────────────────────
    info_y = MARGIN + BOARD_PX + MARGIN // 2
    draw.rectangle([0, info_y, IMG_W, IMG_H], fill=C_INFO_BG)

    if state.player_ids:
        col_w = IMG_W // 4
        for p in range(min(len(state.player_ids), 4)):
            px1 = p * col_w
            is_current = (p == state.current_player and state.phase != 'waiting')

            if is_current:
                draw.rectangle([px1, info_y, px1+col_w, IMG_H],
                               fill='#3A2010')
                # Borde superior resaltado
                draw.line([px1, info_y, px1+col_w, info_y],
                          fill=PLAYER_COLORS[p], width=SCALE*3)

            # Indicador de color
            _draw_circle(draw, px1 + int(col_w*0.15), info_y + int(INFO_H*0.35),
                         int(CELL*0.22), PLAYER_COLORS[p],
                         outline=PLAYER_DARK[p], width=SCALE)

            # Nombre
            fn = _font(int(CELL * 0.2))
            name = state.player_names[p][:9]
            draw.text((px1 + int(col_w*0.32), info_y + int(INFO_H*0.12)),
                      name, font=fn, fill=PLAYER_COLORS[p])

            # Fichas terminadas
            finished = sum(1 for pc in state.pieces[p] if pc.pos == 57)
            fi = _font(int(CELL * 0.17))
            draw.text((px1 + int(col_w*0.32), info_y + int(INFO_H*0.42)),
                      f'Meta: {finished}/4', font=fi, fill='#CCCCCC')

            # Indicador turno
            if is_current and state.phase != 'waiting':
                draw.text((px1 + int(col_w*0.32), info_y + int(INFO_H*0.65)),
                          '← TURNO', font=fi, fill=PLAYER_COLORS[p])

    # ── 9. Escalar a resolución normal (antialiasing) ─────────────────────────
    img = img.resize((OUT_W, OUT_H), Image.LANCZOS)
    return img
