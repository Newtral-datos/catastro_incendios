document.addEventListener("DOMContentLoaded", function () {
  mapboxgl.accessToken = 'pk.eyJ1IjoibmV3dHJhbCIsImEiOiJjazJrcDY4Y2gxMmg3M2JvazU4OXV6NHZqIn0.VO5GkvBq_PSJHvX7T8H9jQ';

  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/newtral/cmebfa21b00qi01sc5en911hx',
    center: [-3.7038, 40.4168],
    zoom: 5
  });

  // Mostrar errores en consola sin detener el mapa
  map.on('error', (e) => {
    console.error('Mapbox GL JS error:', e && (e.error?.message || e.message) || e);
  });

  map.on('load', function () {
    // Funciones de ayuda para formatear datos
    const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });

    const formatMetros = (v) => {
      if (v == null || v === '' || v === 'No disponible') return 'No disponible';
      const num = parseFloat(v);
      if (Number.isNaN(num)) return 'No disponible';
      const s = num.toString().replace(/\..*/g, '');
      if (s.length === 4) return s.slice(0, 1) + '.' + s.slice(1);
      if (s.length > 4) return num.toLocaleString('es-ES', { minimumFractionDigits: 0 });
      return s;
    };

    const normalizeCCAA = (x) => {
      if (!x) return 'Desconocido';
      if (x === 'Castilla_Leon') return 'Castilla y León';
      if (x === 'Baleares') return 'Islas Baleares';
      if (x === 'Comunidad_Valenciana') return 'Comunidad Valenciana';
      return x;
    };

    const first = (obj, keys, fallback = '—') => {
      for (const k of keys) {
        const v = obj[k];
        if (v !== undefined && v !== null && v !== '') return v;
      }
      return fallback;
    };

    // Popup para capa de coincidencias
    const renderPopupCoincidentes = (feature) => {
      const p = feature.properties || {};
      let construccion = p.beginning ?? 'Desconocido';
      const uso = p.currentUse ?? 'Desconocido';
      const viviendas = p.numberOfBuildingUnits ?? 'Sin información';
      let metros = formatMetros(p.value ?? 'No disponible');
      let provincia = normalizeCCAA(p.PROVINCE ?? 'Desconocido');

      if (construccion !== 'Desconocido' && !isNaN(construccion)) {
        const anio = parseInt(construccion);
        if (anio >= 2025 || anio <= 999) {
          construccion = `${construccion}`;
        }
      }

      return `
        <div>
          <div><span class="popup-etiqueta">Año de construcción:</span> <span class="popup-construccion">${construccion}</span></div>
          <div><span class="popup-etiqueta">Uso:</span> ${uso}</div>
          <div><span class="popup-etiqueta">Superficie:</span> ${metros} m²</div>
          ${uso === 'Residencial' ? `<div><span class="popup-etiqueta">Viviendas:</span> ${viviendas}</div>` : ''}
          <div><span class="popup-etiqueta">Provincia:</span> ${provincia}</div>
        </div>
      `;
    };

    // Popup para capa de incendios
    const renderPopupIncendios = (feature) => {
      const p = feature.properties || {};
      const fecha    = p.FECHA_INCENDIO || '—';
      const commune  = p.COMMUNE || '—';
      const province = p.PROVINCE || '—';

      let hectareas = (p.HECTAREAS != null && !isNaN(p.HECTAREAS))
        ? Number(p.HECTAREAS).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
        : '—';

      if (commune === "A Veiga" && province === "Ourense" && fecha === "15/08/2025") {
        hectareas = "28.010";
      }

      return `
        <div>
          <div><span class="popup-etiqueta">Hectáreas quemadas:</span> <span class="popup-construccion">${hectareas}</span></div>
          <div><span class="popup-etiqueta">Municipio:</span> ${commune}</div>
          <div><span class="popup-etiqueta">Provincia:</span> ${province}</div>
          <div><span class="popup-etiqueta">Fecha del incendio:</span> ${fecha}</div>
        </div>
      `;
    };

    // Definición de capas
    const capas = [
      {
        source: 'incendios_mapa_catastro-axzq1y',
        url: 'mapbox://newtral.4qz8msq5',
        sourceLayer: 'incendios_26_08_2025',
        id: 'incendios_26_08_2025',
        type: 'fill',
        paint: {
          'fill-color': '#ff0001',
          'fill-opacity': 1,
          'fill-outline-color': '#6b6b6b'
        },
        popupRenderer: renderPopupIncendios,
        isBackground: true,
      },
      {
        source: 'datos_catastro_incendios',
        url: 'mapbox://newtral.2txllh37',
        sourceLayer: 'datos_catastro_incendios',
        id: 'datos_catastro_incendios',
        type: 'fill',
        paint: {
          'fill-color': '#01f3b3',
          'fill-opacity': 1,
          'fill-outline-color': '#494949'
        },
        popupRenderer: renderPopupCoincidentes
      }
    ];

    // Añadir fuentes y capas
    const layerIds = [];
    capas.forEach((capa) => {
      try {
        if (!map.getSource(capa.source)) {
          map.addSource(capa.source, { type: 'vector', url: capa.url });
        }
        map.addLayer({
          id: capa.id,
          type: capa.type,
          source: capa.source,
          'source-layer': capa.sourceLayer,
          minzoom: 0,
          maxzoom: 22,
          paint: capa.paint
        });
        layerIds.push(capa.id);
      } catch (err) {
        console.error(`Error al añadir la capa "${capa.id}":`, err);
      }
    });

    // Reordenar capa de incendios bajo coincidencias
    try {
      const fondo = capas.find(c => c.isBackground);
      if (fondo && map.getLayer('datos_catastro_incendios') && map.getLayer(fondo.id)) {
        map.moveLayer(fondo.id, 'datos_catastro_incendios');
      }
    } catch (err) {
      console.warn('No se pudo reordenar capas:', err);
    }

    // Capa de puntos adicionales
    try {
      if (!map.getSource('centroides_inc_cat-6v835b')) {
        map.addSource('centroides_incendios', {
          type: 'vector',
          url: 'mapbox://newtral.7tzvagbg'
        });
      }
      map.addLayer({
        id: 'centroides_inc_cat-6v835b',
        type: 'circle',
        source: 'centroides_incendios',
        'source-layer': 'centroides_incendios',
        minzoom: 3,
        maxzoom: 15,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 5, 3, 10, 3, 12, 3],
          'circle-color': '#01f3b3',
          'circle-opacity': 1,
          'circle-stroke-color': '#494949',
          'circle-stroke-width': 0.6,
          'circle-stroke-opacity': 0.5
        }
      });
      if (map.getLayer('centroides_incendios') && map.getLayer('datos_catastro_incendios')) {
        map.moveLayer('centroides_incendios');
      }
    } catch (err) {
      console.error('Error con la capa de puntos:', err);
    }

    // Eventos de popup por capa
    capas.forEach((capa) => {
      map.on('mousemove', capa.id, function (e) {
        if (e.features && e.features.length > 0) {
          map.getCanvas().style.cursor = 'pointer';
          const html = capa.popupRenderer(e.features[0]);
          popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
        }
      });
      map.on('mouseleave', capa.id, function () {
        map.getCanvas().style.cursor = '';
        popup.remove();
      });
    });

    // Popup para puntos
    map.on('mousemove', 'centroides_catastro_incendios-dsi8ml', function (e) {
      if (e.features && e.features.length > 0) {
        map.getCanvas().style.cursor = 'pointer';
        const html = renderPopupCoincidentes(e.features[0]);
        popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      }
    });
    map.on('mouseleave', 'centroides_catastro_incendios-dsi8ml', function () {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });

    // Leyenda
    const legendContent = document.getElementById('legend-content');

    legendContent.innerHTML = `
      <div class="legend-title">Leyenda</div>
      <div class="legend-item">
        <span class="legend-color" style="background-color:#ff0001;"></span>
        <span class="legend-text">Áreas quemadas</span>
      </div>
      <div class="legend-item">
        <span class="legend-color" style="background-color:#01f3b3;"></span>
        <span class="legend-text">Nuevas construcciones</span>
      </div>
    `;

    // Agregar la leyenda al contenedor del mapa
    map.getContainer().appendChild(legendContent);

    // Geocoder para búsqueda
    const geocoder = new MapboxGeocoder({
      accessToken: mapboxgl.accessToken,
      mapboxgl: mapboxgl,
      placeholder: "   Buscar ubicación...",
      marker: false
    });
    document.getElementById("geocoder-container").appendChild(geocoder.onAdd(map));
  });
});
