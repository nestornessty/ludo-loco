"""
Ludo Loco - Board Data
Tablero 15x15, camino de 52 casillas en sentido horario.
"""

# Camino principal - 52 casillas en sentido horario (fila, columna)
# Basado en tablero 15x15 estándar de Parchís
MAIN_PATH = [
    # --- Amarillo sale aquí (pos 0) ---
    # Fila 6, cols 0-5 (hacia la derecha)
    (6,0),(6,1),(6,2),(6,3),(6,4),(6,5),
    # Col 6, filas 5-0 (hacia arriba)
    (5,6),(4,6),(3,6),(2,6),(1,6),(0,6),
    # Centro superior (pos 12)
    (0,7),
    # --- Verde sale aquí (pos 13) ---
    # Col 8, filas 0-5 (hacia abajo)
    (0,8),(1,8),(2,8),(3,8),(4,8),(5,8),
    # Fila 6, cols 9-14 (hacia la derecha)
    (6,9),(6,10),(6,11),(6,12),(6,13),(6,14),
    # Centro derecho (pos 25)
    (7,14),
    # --- Rojo sale aquí (pos 26) ---
    # Fila 8, cols 14-9 (hacia la izquierda)
    (8,14),(8,13),(8,12),(8,11),(8,10),(8,9),
    # Col 8, filas 9-14 (hacia abajo)
    (9,8),(10,8),(11,8),(12,8),(13,8),(14,8),
    # Centro inferior (pos 38)
    (14,7),
    # --- Azul sale aquí (pos 39) ---
    # Col 6, filas 14-9 (hacia arriba)
    (14,6),(13,6),(12,6),(11,6),(10,6),(9,6),
    # Fila 8, cols 5-0 (hacia la izquierda)
    (8,5),(8,4),(8,3),(8,2),(8,1),(8,0),
    # Centro izquierdo (pos 51)
    (7,0),
]

# Índices de salida en el camino principal (por jugador)
# 0=Amarillo, 1=Verde, 2=Rojo, 3=Azul
PLAYER_STARTS = [0, 13, 26, 39]

# Caminos de llegada (5 casillas por jugador, desde entrada hacia el centro)
# Posición relativa 52-56 corresponde a HOME_STRETCHES[player][pos-52]
HOME_STRETCHES = [
    [(7,1),(7,2),(7,3),(7,4),(7,5)],      # Amarillo: fila 7, cols 1-5 →
    [(1,7),(2,7),(3,7),(4,7),(5,7)],      # Verde: col 7, filas 1-5 ↓
    [(7,13),(7,12),(7,11),(7,10),(7,9)],  # Rojo: fila 7, cols 13-9 ←
    [(13,7),(12,7),(11,7),(10,7),(9,7)],  # Azul: col 7, filas 13-9 ↑
]

# Centro/meta (posición 57 = terminado)
CENTER = (7, 7)

# Slots de fichas en casa (4 por jugador, en sus esquinas)
HOME_SLOTS = [
    [(2,2),(2,4),(4,2),(4,4)],           # Amarillo (esquina arriba-izquierda)
    [(2,10),(2,12),(4,10),(4,12)],       # Verde (esquina arriba-derecha)
    [(10,10),(10,12),(12,10),(12,12)],   # Rojo (esquina abajo-derecha)
    [(10,2),(10,4),(12,2),(12,4)],       # Azul (esquina abajo-izquierda)
]

# Casillas seguras (índices absolutos en MAIN_PATH donde no hay capturas)
SAFE_SQUARES = {0, 8, 13, 21, 26, 34, 39, 47}

# Colores de jugadores
PLAYER_COLORS     = ['#FFD700', '#22CC44', '#FF4444', '#3399FF']  # Amarillo, Verde, Rojo, Azul
PLAYER_DARK       = ['#CC8800', '#117722', '#BB1111', '#1155BB']
PLAYER_LIGHT      = ['#FFF5B0', '#B0FFB0', '#FFB0B0', '#B0CCFF']
PLAYER_NAMES      = ['Amarillo', 'Verde', 'Rojo', 'Azul']
PLAYER_EMOJIS     = ['🟡', '🟢', '🔴', '🔵']
PLAYER_HOME_AREA  = [
    (0, 0, 5, 5),    # Amarillo: filas 0-5, cols 0-5
    (0, 9, 5, 14),   # Verde: filas 0-5, cols 9-14
    (9, 9, 14, 14),  # Rojo: filas 9-14, cols 9-14
    (9, 0, 14, 5),   # Azul: filas 9-14, cols 0-5
]
