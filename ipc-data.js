// Variación mensual del IPC (INDEC, nivel general nacional, en %).
// Estos valores vienen precargados como base. Desde la pestaña "IPC" podés:
//   - editarlos a mano, o
//   - traer los últimos publicados con el botón "Actualizar desde internet"
//     (fuente: la serie oficial del INDEC en apis.datos.gob.ar, con dos decimales;
//      si no responde, se usa api.argentinadatos.com, que solo trae un decimal).
// Los valores editados por vos siempre pisan a los precargados.
const IPC_BASE = {
  '2023-01': 6.03,  '2023-02': 6.63,  '2023-03': 7.68,  '2023-04': 8.40,
  '2023-05': 7.77,  '2023-06': 5.95,  '2023-07': 6.34,  '2023-08': 12.44,
  '2023-09': 12.75, '2023-10': 8.30,  '2023-11': 12.81, '2023-12': 25.47,

  '2024-01': 20.61, '2024-02': 13.24, '2024-03': 11.01, '2024-04': 8.83,
  '2024-05': 4.20,  '2024-06': 4.58,  '2024-07': 4.03,  '2024-08': 4.17,
  '2024-09': 3.47,  '2024-10': 2.69,  '2024-11': 2.43,  '2024-12': 2.70,

  '2025-01': 2.21,  '2025-02': 2.40,  '2025-03': 3.73,  '2025-04': 2.78,
  '2025-05': 1.50,  '2025-06': 1.62,  '2025-07': 1.90,  '2025-08': 1.88,
  '2025-09': 2.08,  '2025-10': 2.34,  '2025-11': 2.47,  '2025-12': 2.85,

  '2026-01': 2.88,  '2026-02': 2.90,  '2026-03': 3.38,  '2026-04': 2.58,
  '2026-05': 2.15,  '2026-06': 1.89,  '2026-07': 2.11,
};
