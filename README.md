# Arquiler · Panel de gestión de alquileres

Webapp estática para administrar alquileres de departamentos (Argentina):

- Ajuste del alquiler por **IPC** (suma simple o acumulado compuesto, configurable
  por contrato) o monto fijo en **USD** / pesos.
- Checklist mensual: ¿pagó el inquilino? ¿lo facturaste en ARCA?
- Ficha por departamento: inquilino, contrato, cochera, depósito.
- Alertas: pagos atrasados, contratos por vencer, próximos ajustes con precio
  estimado, IPC faltante.
- IPC editable, con actualización automática desde
  [argentinadatos.com](https://argentinadatos.com) (datos INDEC).
- Backup y restauración en JSON, exportación CSV.

**Los datos viven únicamente en tu navegador** (localStorage): esta página no
tiene servidor ni base de datos, y este repositorio no contiene datos de nadie.
Para usar tus datos en otro dispositivo, exportá el backup JSON en uno y
restauralo en el otro (pestaña Backup).

App en vivo: https://rafamiz.github.io/arquiler-app/
