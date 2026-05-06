import { supabase } from './supabase_service.js';

async function verificarConexion() {
    console.log("Iniciando prueba de conexión...");
    try {
        // Intenta leer la tabla de productos
        const { data, error } = await supabase.from('products').select('count');
        
        if (error) {
            console.error("❌ Error al conectar con Supabase:", error.message);
        } else {
            console.log("✅ Conexión establecida correctamente. Tablas accesibles.");
        }
    } catch (err) {
        console.error("❌ Error inesperado:", err);
    }
}

verificarConexion();