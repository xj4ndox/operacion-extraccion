# Operación Extracción

Videojuego FPS 3D hecho con **Three.js** para el curso *Computación Gráfica y Visual* (UPN, T3).

**Historia:** el mundo fue invadido por zombis. Cruza una calle infestada, cuida tus balas y llega a la zona verde de extracción antes de que te atrapen.

## Cómo ejecutarlo

El juego necesita un servidor local (no funciona con doble clic en `index.html`).

1. Instala [Python](https://www.python.org/) o usa la extensión **Live Server** de VS Code.
2. Abre una terminal dentro de esta carpeta y ejecuta:
   ```
   python -m http.server 5500
   ```
3. Abre en el navegador: http://localhost:5500
4. Haz clic en **JUGAR** (se necesita internet para cargar Three.js desde el CDN).

## Controles

| Tecla / Mouse | Acción |
|---|---|
| W / A / S / D | Moverse |
| Mouse | Mirar |
| Clic izquierdo | Un disparo (no hay disparo automático) |
| 1 | Pistola |
| 2 | Escopeta |
| Esc | Pausa |

## Reglas del juego

- Cada arma tiene su **propia munición**. Cada disparo gasta 1 bala; con 0 balas no dispara.
- La munición solo se recupera recogiendo **cajas de munición** en el mapa.
- Cada zombi tiene **2 puntos de vida**: muere con exactamente 2 impactos.
- Los zombis están quietos hasta que te acercas (rango de detección: 16 m).
- Si un zombi te toca: **GAME OVER**.
- Si llegas a la zona verde: **¡MISIÓN COMPLETADA!**
- Objetos coleccionables: caja de munición (+6 pistola, +3 escopeta) y potenciador de velocidad.

## Modelos GLB

Los modelos se colocan en la carpeta `models/`:

```
models/arma1.glb     -> Pistola
models/arma2.glb     -> Escopeta
models/zombie.glb    -> Zombi
```

- Armas: `size`, `pos`, `rotY`
- Zombi: `height`, `yawOffset`

## Estructura

```
operacion-extraccion/
├── index.html
├── main.js
├── README.md
└── models/
    ├── arma1.glb
    ├── arma2.glb
    └── zombie.glb
```

## Dónde está cada requisito en `main.js`

| Requisito | Sección del código |
|---|---|
| Cámara FPS y movimiento (RF06) | `updatePlayer`, `PointerLockControls` |
| Armas GLB y cambio con 1 / 2 (RF01) | `buildWeapons`, `selectWeapon` |
| Un disparo por clic (RF01) | evento `mousedown` + `shoot` |
| Munición por arma (RF02) | `ammo`, `shoot`, `updatePickups` |
| Escenario y progresión (RF03, RF08) | `buildWorld`, `LEVEL` |
| Zombis GLB (RF04) | `spawnZombie` |
| Detección y persecución (RF05) | `updateZombies` |
| Disparos y 2 impactos (RF07) | `shoot` (raycasting), `damageZombie` |
| Game Over / Victoria (RF09, RF08) | `gameOver`, `victory` |
| Coleccionables (RF10) | `spawnPickup`, `updatePickups` |
| Dificultad (RF11) | zombis rápidos, munición limitada, barricadas |

## Fuentes de recursos externos

- Three.js: https://threejs.org/ (licencia MIT)
- Modelos GLB: 
Recurso	Uso en el juego	Fuente	
    1. ZOMBIE: Pie Grande / Demonio Necrófago (modelo 3D)	Zombi (models/zombie.glb)	Pixabay: https://pixabay.com/es/3d-models/pie-grande-demonio-necr%C3%B3fago-1716/	Pixabay Content License
    2. Arma 1: Glock liquid chromada con corredera metálica morada, zombie oscuro (modelo 3D)	Arma 1: pistola (models/arma1.glb)	Tripo Studio: https://studio.tripo3d.ai/3d-model/una-glock-liquid-chromada-con-corredera-met%C3%A1lica-morada-zombie-oscuro-df8162a7-3ea9-4092-848f-19cb85151791
    3. Arma 2: Pump-action shotgun with carved pumpkin, ornate scrollwork, spider web (modelo 3D)	Arma 2: escopeta (models/arma2.glb)	Tripo Studio: https://studio.tripo3d.ai/3d-model/pump-action-shotgun-with-carved-pumpkin-ornate-scrollwork-spider-web-13844020-235c-4c6a-a8a2-03fee0dfb7fe

Texturas del escenario (ventanas, asfalto) y sonidos: generados por código en el propio juego, sin archivos externos.
