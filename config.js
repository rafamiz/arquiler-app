// Conexión a la nube (Supabase, proyecto "nutria" de Rafa — tabla arquiler_estado).
// Estas claves son PÚBLICAS por diseño: solas no permiten leer nada.
// La seguridad la dan el login (Supabase Auth) y las políticas RLS de la base.
const SUPABASE_CONFIG = {
  url: 'https://cykkgymiocdcugkkhfsi.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5a2tneW1pb2NkY3Vna2toZnNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0OTg3NjEsImV4cCI6MjA5ODA3NDc2MX0.KKDFE4rMiC6foftFzZ3OzHkpbc1fax6ZZQNyBF594K8',
};
