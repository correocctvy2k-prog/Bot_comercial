/**
 * Proxy de imágenes de Trello.
 * Las URLs de adjuntos/previews en tableros privados requieren autenticación.
 * Este endpoint hace la solicitud autenticada y reenvía la imagen al cliente.
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../config/trello');

router.get('/proxy', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Parámetro url requerido' });
  }

  try {
    // Decodificar la URL
    const decoded = decodeURIComponent(url);
    let fetchUrl = decoded;
    const headers = {
      'Accept': 'image/*,*/*',
      'User-Agent': 'SkylabTareas/1.0',
    };

    // Si es una URL de Trello, enviar credenciales
    if (decoded.includes('trello.com')) {
      const separator = decoded.includes('?') ? '&' : '?';
      fetchUrl = `${decoded}${separator}key=${config.apiKey}&token=${config.token}`;
      // También añadir cabecera estándar OAuth que a veces Trello prefiere para descargas de adjuntos
      headers['Authorization'] = `OAuth oauth_consumer_key="${config.apiKey}", oauth_token="${config.token}"`;
    }

    console.log(`📸 Proxy descargando imagen: ${fetchUrl.substring(0, 100)}...`);

    const response = await axios.get(fetchUrl, {
      responseType: 'stream',
      timeout: 20000,
      headers
    });

    // Cabeceras de respuesta optimizadas para origen cruzado
    res.set('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400'); // 24 horas de caché
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cross-Origin-Embedder-Policy', 'credentialless');

    response.data.pipe(res);
  } catch (error) {
    console.error('⚠️ Error detallado en proxy de imagen:', error.response?.status, error.response?.statusText, error.message);
    // Devolver 200 con imagen vacía en vez de 404 para no romper la UI
    res.status(200).set('Content-Type', 'image/gif');
    // 1x1 pixel GIF transparente
    res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
  }
});

module.exports = router;
