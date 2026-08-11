// Variación mensual del IPC (INDEC, nivel general nacional, en %).
// Estos valores vienen precargados como base. Desde la pestaña "IPC" podés:
//   - editarlos a mano, o
//   - traer los últimos publicados con el botón "Actualizar desde internet"
//     (fuente: api.argentinadatos.com, que replica los datos del INDEC).
// Los valores editados por vos siempre pisan a los precargados.
const IPC_BASE = {
  '2023-01': 6.0,  '2023-02': 6.6,  '2023-03': 7.7,  '2023-04': 8.4,
  '2023-05': 7.8,  '2023-06': 6.0,  '2023-07': 6.3,  '2023-08': 12.4,
  '2023-09': 12.7, '2023-10': 8.3,  '2023-11': 12.8, '2023-12': 25.5,

  '2024-01': 20.6, '2024-02': 13.2, '2024-03': 11.0, '2024-04': 8.8,
  '2024-05': 4.2,  '2024-06': 4.6,  '2024-07': 4.0,  '2024-08': 4.2,
  '2024-09': 3.5,  '2024-10': 2.7,  '2024-11': 2.4,  '2024-12': 2.7,

  '2025-01': 2.2,  '2025-02': 2.4,  '2025-03': 3.7,  '2025-04': 2.8,
  '2025-05': 1.5,  '2025-06': 1.6,  '2025-07': 1.9,  '2025-08': 1.9,
  '2025-09': 2.1,  '2025-10': 2.3,  '2025-11': 2.5,  '2025-12': 2.8,

  '2026-01': 2.9,  '2026-02': 2.9,  '2026-03': 3.4,  '2026-04': 2.6,
  '2026-05': 2.1,  '2026-06': 1.9,
};
