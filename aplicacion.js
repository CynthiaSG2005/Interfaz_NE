/* ==========================================================================
   ECOSPHERE — LÓGICA PRINCIPAL DE LA CONSOLA (JAVASCRIPT ESTÁNDAR)
   Sin dependencias ni bibliotecas externas. 100% accesible por teclado.
   ========================================================================== */

'use strict';

(function iniciarAplicacion() {
  const CLAVE_VENTAS_CRM = 'ecosphere_ventas_crm_v1';
  const CLAVE_PREF_ACCESIBILIDAD = 'ecosphere_accesibilidad_v1';

  const estado = {
    datos: null,
    vistaActual: 'crm',
    filtroCrm: 'todos',
    textoBusqueda: '',
    paginaCrm: 1,
    elementosPorPagina: 4,
    clienteSeleccionadoId: null,
    modeloConfiguradorId: 'enterprise',
    mantenimientoEnConfigurador: false,
    modalidadFacturacion: 'anual',
    carritoRepuestos: {},
    pasoPedido: 1,
    mantenimientoEnPedido: false,
    periodoMetricas: '30dias',
    escalaTexto: 0,
    altoContraste: false,
    lectorActivo: false,
    ultimoElementoEnfocado: null
  };

  /* ------------------------------------------------------------------------
     UTILIDADES DE FORMATO Y ACCESIBILIDAD
     ------------------------------------------------------------------------ */
  function formatearMoneda(cantidad, simbolo = '€') {
    return simbolo + ' ' + Number(cantidad).toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function anunciar(mensaje) {
    const anunciador = document.getElementById('anunciador-aria');
    if (anunciador) {
      anunciador.textContent = '';
      window.setTimeout(() => {
        anunciador.textContent = mensaje;
      }, 40);
    }
  }

  let temporizadorToast = null;
  function mostrarNotificacion(mensaje) {
    const caja = document.getElementById('notificacion-flotante');
    if (!caja) return;
    caja.textContent = mensaje;
    caja.hidden = false;
    anunciar(mensaje);

    if (temporizadorToast) window.clearTimeout(temporizadorToast);
    temporizadorToast = window.setTimeout(() => {
      caja.hidden = true;
    }, 3600);
  }

  function escaparHtml(texto) {
    const div = document.createElement('div');
    div.textContent = String(texto || '');
    return div.innerHTML;
  }

  /* ------------------------------------------------------------------------
     CARGA INICIAL DESDE ARCHIVO JSON ESTÁNDAR
     ------------------------------------------------------------------------ */
  async function cargarDatos() {
    try {
      const respuesta = await fetch('/data/ecosphere.json');
      if (!respuesta.ok) {
        throw new Error('No fue posible leer el archivo de datos.');
      }
      estado.datos = await respuesta.json();
      combinarVentasGuardadas();

      if (estado.datos.clientes.length > 0) {
        estado.clienteSeleccionadoId = estado.datos.clientes[0].id;
      }

      renderizarTodo();
      gestionarRutaInicial();
    } catch (error) {
      mostrarNotificacion('Error al cargar los datos locales: ' + error.message);
    }
  }

  function combinarVentasGuardadas() {
    if (!estado.datos) return;
    try {
      const guardadas = JSON.parse(localStorage.getItem(CLAVE_VENTAS_CRM) || '[]');
      if (Array.isArray(guardadas) && guardadas.length > 0) {
        estado.datos.clientes = [...guardadas, ...estado.datos.clientes];
      }
    } catch (_) {
      /* Si el almacenamiento local falla, continuar con el catálogo base */
    }
  }

  function renderizarTodo() {
    renderizarListaCrm();
    renderizarDetalleCrm();
    renderizarCatalogoModelos();
    renderizarTablaEdge();
    actualizarResumenConfigurador();
    renderizarPlanesMantenimiento();
    renderizarRepuestos();
    actualizarResumenPedido();
    renderizarMetricas();
  }

  /* ------------------------------------------------------------------------
     NAVEGACIÓN ENTRE LAS 5 PANTALLAS Y MENÚ MÓVIL
     ------------------------------------------------------------------------ */
  const nombresVistas = {
    crm: 'CRM y Ventas',
    catalogo: 'Catálogo Smart Bin IA',
    mantenimiento: 'Servicios de Mantenimiento',
    pedidos: 'Pedidos y Checkout',
    metricas: 'Métricas de Reciclaje'
  };

  function cambiarVista(vista, moverFoco = false) {
    if (!nombresVistas[vista]) vista = 'crm';
    estado.vistaActual = vista;

    document.querySelectorAll('.vista-pantalla').forEach((seccion) => {
      seccion.hidden = seccion.id !== 'vista-' + vista;
    });

    document.querySelectorAll('.enlace-menu').forEach((enlace) => {
      const coincide = enlace.getAttribute('data-vista') === vista;
      if (coincide) {
        enlace.setAttribute('aria-current', 'page');
      } else {
        enlace.removeAttribute('aria-current');
      }
    });

    if (window.location.hash !== '#' + vista) {
      window.history.replaceState(null, '', '#' + vista);
    }

    cerrarMenuMovil();
    document.title = nombresVistas[vista] + ' — Ecosphere Smart Bin IA';
    anunciar('Pantalla activa: ' + nombresVistas[vista]);

    if (moverFoco) {
      const principal = document.getElementById('contenido-principal');
      if (principal) principal.focus();
    }
  }

  function gestionarRutaInicial() {
    const hash = window.location.hash.replace('#', '').trim();
    if (nombresVistas[hash]) {
      cambiarVista(hash, false);
    } else {
      cambiarVista('crm', false);
    }
  }

  function abrirMenuMovil() {
    const barra = document.getElementById('barra-lateral');
    const telon = document.getElementById('telon-movil');
    const boton = document.getElementById('btn-menu-movil');
    if (barra) barra.classList.add('abierta');
    if (telon) {
      telon.hidden = false;
      telon.classList.add('visible');
    }
    if (boton) boton.setAttribute('aria-expanded', 'true');
  }

  function cerrarMenuMovil() {
    const barra = document.getElementById('barra-lateral');
    const telon = document.getElementById('telon-movil');
    const boton = document.getElementById('btn-menu-movil');
    if (barra) barra.classList.remove('abierta');
    if (telon) {
      telon.hidden = true;
      telon.classList.remove('visible');
    }
    if (boton) boton.setAttribute('aria-expanded', 'false');
  }

  /* ------------------------------------------------------------------------
     PANTALLA 1: CRM Y VENTAS
     ------------------------------------------------------------------------ */
  function obtenerClientesFiltrados() {
    if (!estado.datos) return [];
    const termino = estado.textoBusqueda.trim().toLowerCase();

    return estado.datos.clientes.filter((cliente) => {
      let pasaFiltro = true;
      if (estado.filtroCrm === 'con-mantenimiento') pasaFiltro = Boolean(cliente.tieneMantenimiento);
      else if (estado.filtroCrm === 'solo-hardware') pasaFiltro = !cliente.tieneMantenimiento;
      else if (estado.filtroCrm === 'pendiente') pasaFiltro = Boolean(cliente.despachoPendiente);

      if (!pasaFiltro) return false;
      if (!termino) return true;

      const cadena = [
        cliente.id,
        cliente.nombre,
        cliente.correo,
        cliente.direccion,
        cliente.modelo,
        cliente.contactoNombre
      ].join(' ').toLowerCase();

      return cadena.includes(termino);
    });
  }

  function renderizarListaCrm() {
    const contenedor = document.getElementById('lista-clientes-crm');
    const contador = document.getElementById('contador-crm');
    const estadoPagina = document.getElementById('estado-pagina-crm');
    const btnAnterior = document.getElementById('btn-crm-anterior');
    const btnSiguiente = document.getElementById('btn-crm-siguiente');
    const kpiClientes = document.getElementById('kpi-crm-clientes');
    if (!contenedor || !estado.datos) return;

    const filtrados = obtenerClientesFiltrados();
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / estado.elementosPorPagina));
    if (estado.paginaCrm > totalPaginas) estado.paginaCrm = totalPaginas;

    const inicio = (estado.paginaCrm - 1) * estado.elementosPorPagina;
    const visibles = filtrados.slice(inicio, inicio + estado.elementosPorPagina);

    if (kpiClientes) {
      const baseTotal = 1244 + estado.datos.clientes.length;
      kpiClientes.textContent = baseTotal.toLocaleString('es-ES');
    }

    if (contador) {
      contador.textContent = 'Mostrando ' + visibles.length + ' de ' + filtrados.length + ' clientes';
    }
    if (estadoPagina) {
      estadoPagina.textContent = 'Página ' + estado.paginaCrm + ' de ' + totalPaginas;
    }
    if (btnAnterior) btnAnterior.disabled = estado.paginaCrm <= 1;
    if (btnSiguiente) btnSiguiente.disabled = estado.paginaCrm >= totalPaginas;

    contenedor.innerHTML = '';

    if (visibles.length === 0) {
      const vacio = document.createElement('div');
      vacio.className = 'tarjeta';
      vacio.innerHTML =
        '<strong>No se encontraron clientes con ese criterio.</strong>' +
        '<p class="ayuda-campo" style="margin:6px 0 10px;">Prueba limpiar el buscador o seleccionar otro filtro.</p>' +
        '<button type="button" id="btn-limpiar-filtros-crm" class="boton boton-secundario">Mostrar todos</button>';
      contenedor.appendChild(vacio);

      const btnLimpiar = document.getElementById('btn-limpiar-filtros-crm');
      if (btnLimpiar) {
        btnLimpiar.addEventListener('click', () => {
          estado.filtroCrm = 'todos';
          estado.textoBusqueda = '';
          const buscador = document.getElementById('buscador-global');
          if (buscador) buscador.value = '';
          actualizarBotonesFiltroCrm();
          renderizarListaCrm();
        });
      }
      return;
    }

    visibles.forEach((cliente) => {
      const seleccionado = cliente.id === estado.clienteSeleccionadoId;
      const articulo = document.createElement('article');
      articulo.className = 'tarjeta-cliente';
      articulo.setAttribute('role', 'option');
      articulo.setAttribute('tabindex', '0');
      articulo.setAttribute('aria-selected', seleccionado ? 'true' : 'false');
      articulo.setAttribute('data-cliente-id', cliente.id);

      const estadoDespacho = cliente.despachoPendiente ? ' · Despacho pendiente' : '';

      articulo.innerHTML =
        '<div class="cliente-superior">' +
          '<div>' +
            '<h3 class="cliente-nombre">' + escaparHtml(cliente.nombre) + '</h3>' +
            '<div class="cliente-meta">' +
              escaparHtml(cliente.categoria) + ' · ' + escaparHtml(cliente.etiquetaMantenimiento) + escaparHtml(estadoDespacho) +
            '</div>' +
            '<div class="cliente-contacto-linea">' +
              '<span>' + escaparHtml(cliente.correo) + '</span>' +
              '<span>' + escaparHtml(cliente.telefono) + '</span>' +
              '<span>' + escaparHtml(cliente.direccionCorta || cliente.direccion) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="cliente-hardware">' +
            '<span class="cliente-unidades">' + escaparHtml(cliente.unidades) + ' Smart Bins IA</span>' +
            '<span class="cliente-modelo">' + escaparHtml(cliente.modelo) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="cliente-inferior">' +
          '<span>Entrega accesible verificada</span>' +
          '<span>' + escaparHtml(cliente.ultimaSync) + ' · ID: ' + escaparHtml(cliente.id) + '</span>' +
        '</div>';

      articulo.addEventListener('click', () => seleccionarCliente(cliente.id));
      articulo.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault();
          seleccionarCliente(cliente.id);
        }
      });

      contenedor.appendChild(articulo);
    });
  }

  function seleccionarCliente(idCliente) {
    estado.clienteSeleccionadoId = idCliente;
    renderizarListaCrm();
    renderizarDetalleCrm();
    const cliente = estado.datos.clientes.find((c) => c.id === idCliente);
    if (cliente) {
      anunciar('Ficha seleccionada: ' + cliente.nombre);
    }
  }

  function renderizarDetalleCrm() {
    if (!estado.datos) return;
    const cliente = estado.datos.clientes.find((c) => c.id === estado.clienteSeleccionadoId) || estado.datos.clientes[0];
    if (!cliente) return;

    document.getElementById('detalle-cliente-nombre').textContent = cliente.nombre;
    document.getElementById('detalle-cliente-id').textContent = 'ID: ' + cliente.id + ' · ' + cliente.categoria;
    document.getElementById('detalle-contacto-nombre').textContent = cliente.contactoNombre;
    document.getElementById('detalle-contacto-cargo').textContent = cliente.contactoCargo;

    const enlaceCorreo = document.getElementById('detalle-contacto-correo');
    enlaceCorreo.textContent = cliente.correo;
    enlaceCorreo.href = 'mailto:' + cliente.correo;

    const enlaceTelefono = document.getElementById('detalle-contacto-telefono');
    enlaceTelefono.textContent = cliente.telefono;
    enlaceTelefono.href = 'tel:' + cliente.telefono.replace(/[^+\d]/g, '');

    document.getElementById('detalle-direccion').textContent = cliente.direccion;

    const listaAcc = document.getElementById('detalle-accesibilidad');
    listaAcc.innerHTML = '';
    (cliente.accesibilidad || []).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      listaAcc.appendChild(li);
    });

    document.getElementById('detalle-capacidad').textContent = cliente.capacidadActual;
    document.getElementById('detalle-recoleccion').textContent = cliente.recoleccion;
    document.getElementById('detalle-sensor').textContent = cliente.sensorEstado;
    document.getElementById('detalle-firmware').textContent = cliente.firmware;
    document.getElementById('detalle-oportunidad-texto').textContent = cliente.oportunidadEtica
      ? cliente.oportunidadEtica.texto
      : 'Sin recomendaciones pendientes.';

    const bitacoraEl = document.getElementById('detalle-bitacora');
    bitacoraEl.innerHTML = '';
    (cliente.bitacora || []).forEach((entrada) => {
      const div = document.createElement('div');
      div.className = 'item-bitacora';
      div.innerHTML =
        '<strong>' + escaparHtml(entrada.titulo) + '</strong>' +
        '<div>' + escaparHtml(entrada.detalle) + '</div>' +
        '<small>' + escaparHtml(entrada.fecha) + '</small>';
      bitacoraEl.appendChild(div);
    });
  }

  function actualizarBotonesFiltroCrm() {
    document.querySelectorAll('[data-filtro-crm]').forEach((boton) => {
      const activo = boton.getAttribute('data-filtro-crm') === estado.filtroCrm;
      boton.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
  }

  function exportarReporteCsv() {
    const clientes = obtenerClientesFiltrados();
    const encabezados = ['ID', 'Cliente', 'Categoria', 'Correo', 'Telefono', 'Unidades', 'Modelo', 'Mantenimiento', 'Direccion'];
    const filas = clientes.map((c) => [
      c.id,
      c.nombre,
      c.categoria,
      c.correo,
      c.telefono,
      c.unidades,
      c.modelo,
      c.tieneMantenimiento ? 'Activo' : 'Solo Hardware',
      c.direccion
    ].map((campo) => '"' + String(campo || '').replace(/"/g, '""') + '"').join(','));

    const csv = '\uFEFF' + encabezados.join(',') + '\n' + filas.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'ecosphere_reporte_crm.csv';
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
    mostrarNotificacion('Reporte CSV de clientes descargado.');
  }

  /* ------------------------------------------------------------------------
     PANTALLA 2: CATÁLOGO Y CONFIGURADOR SMART BIN IA
     ------------------------------------------------------------------------ */
  function seleccionarPasoDiagrama(paso) {
    document.querySelectorAll('[data-paso-diagrama]').forEach((btn) => {
      const activo = btn.getAttribute('data-paso-diagrama') === String(paso);
      btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tarjeta-diagrama]').forEach((card) => {
      const activo = card.getAttribute('data-tarjeta-diagrama') === String(paso);
      card.classList.toggle('activo', activo);
    });
  }

  function renderizarCatalogoModelos() {
    const contenedor = document.getElementById('rejilla-modelos-catalogo');
    if (!contenedor || !estado.datos) return;

    const termino = estado.textoBusqueda.trim().toLowerCase();
    const modelos = estado.datos.modelos.filter((m) => {
      if (!termino || estado.vistaActual !== 'catalogo') return true;
      return (m.nombre + ' ' + m.descripcion + ' ' + m.subtitulo).toLowerCase().includes(termino);
    });

    contenedor.innerHTML = '';
    modelos.forEach((modelo) => {
      const seleccionado = modelo.id === estado.modeloConfiguradorId;
      const tarjeta = document.createElement('article');
      tarjeta.className = 'tarjeta tarjeta-modelo' + (seleccionado ? ' seleccionado' : '');

      tarjeta.innerHTML =
        '<div>' +
          '<div class="ayuda-campo" style="margin-bottom:8px; font-weight:600; color:var(--secundario);">' +
            escaparHtml(modelo.etiquetaSegmento) + (modelo.recomendado ? ' · Más elegido' : '') +
          '</div>' +
          '<img src="' + escaparHtml(modelo.imagen) + '" alt="' + escaparHtml(modelo.alt) + '" class="imagen-modelo" />' +
          '<h3 class="titulo-seccion" style="margin-top:12px;">' + escaparHtml(modelo.nombre) + '</h3>' +
          '<p class="subtitulo-seccion" style="margin-bottom:10px;">' + escaparHtml(modelo.descripcion) + '</p>' +
          '<ul class="lista-especificaciones">' +
            '<li><span>Capacidad</span><strong>' + escaparHtml(modelo.capacidad) + '</strong></li>' +
            '<li><span>Separación</span><strong>' + escaparHtml(modelo.separacion) + '</strong></li>' +
            '<li><span>Mecanismo</span><strong>' + escaparHtml(modelo.mecanismo) + '</strong></li>' +
            '<li><span>Equipamiento</span><strong>' + escaparHtml(modelo.autonomia) + '</strong></li>' +
          '</ul>' +
        '</div>' +
        '<div>' +
          '<div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px;">' +
            '<span class="precio-modelo">' + formatearMoneda(modelo.precio) + '</span>' +
            '<span class="ayuda-campo">' + escaparHtml(modelo.disponibilidad) + '</span>' +
          '</div>' +
          '<button type="button" class="boton ' + (seleccionado ? 'boton-primario' : 'boton-secundario') + '" style="width:100%;" data-seleccionar-modelo="' + escaparHtml(modelo.id) + '">' +
            (seleccionado ? 'Modelo seleccionado' : 'Seleccionar modelo') +
          '</button>' +
        '</div>';

      contenedor.appendChild(tarjeta);
    });

    contenedor.querySelectorAll('[data-seleccionar-modelo]').forEach((btn) => {
      btn.addEventListener('click', () => {
        estado.modeloConfiguradorId = btn.getAttribute('data-seleccionar-modelo');
        renderizarCatalogoModelos();
        actualizarResumenConfigurador();
        const configurador = document.getElementById('configurador-catalogo');
        if (configurador) configurador.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }

  function actualizarResumenConfigurador() {
    if (!estado.datos) return;
    const modelo = estado.datos.modelos.find((m) => m.id === estado.modeloConfiguradorId) || estado.datos.modelos[1];
    const inputUnidades = document.getElementById('cfg-unidades');
    const unidades = Math.max(1, Math.min(100, parseInt(inputUnidades.value, 10) || 1));
    inputUnidades.value = unidades;

    const bruto = modelo.precio * unidades;
    const descuento = unidades >= 5 ? bruto * 0.12 : 0;
    const total = bruto - descuento;

    document.getElementById('cfg-nombre-modelo').textContent = modelo.nombre;
    document.getElementById('cfg-resumen-modelo').textContent = modelo.nombre;
    document.getElementById('cfg-resumen-unitario').textContent = formatearMoneda(modelo.precio);
    document.getElementById('cfg-resumen-unidades').textContent = unidades + (unidades === 1 ? ' unidad' : ' unidades');
    document.getElementById('cfg-resumen-descuento').textContent = descuento > 0 ? '− ' + formatearMoneda(descuento) : formatearMoneda(0);
    document.getElementById('cfg-resumen-mantenimiento').textContent = estado.mantenimientoEnConfigurador
      ? formatearMoneda(unidades * 38) + '/mes'
      : 'Solo hardware (€ 0/mes)';
    document.getElementById('cfg-resumen-total').textContent = formatearMoneda(total);
  }

  function renderizarTablaEdge() {
    const tbody = document.getElementById('tabla-capacidades-edge');
    if (!tbody || !estado.datos) return;
    tbody.innerHTML = '';

    estado.datos.capacidadesEdge.forEach((fila) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><strong>' + escaparHtml(fila.material) + '</strong></td>' +
        '<td>' + escaparHtml(fila.sensor) + '</td>' +
        '<td>' + escaparHtml(fila.precision.toFixed(1)) + '%</td>' +
        '<td>' + escaparHtml(fila.compuerta) + '</td>' +
        '<td>' + escaparHtml(fila.estado) + '</td>';
      tbody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------------
     PANTALLA 3: SERVICIOS DE MANTENIMIENTO Y REPUESTOS
     ------------------------------------------------------------------------ */
  function renderizarPlanesMantenimiento() {
    const contenedor = document.getElementById('rejilla-planes-mantenimiento');
    if (!contenedor || !estado.datos) return;
    contenedor.innerHTML = '';

    const esAnual = estado.modalidadFacturacion === 'anual';

    estado.datos.planesMantenimiento.forEach((plan) => {
      const precio = esAnual ? plan.precioAnual : plan.precioEvento;
      const unidad = esAnual ? plan.unidadAnual : plan.unidadEvento;

      const card = document.createElement('article');
      card.className = 'tarjeta tarjeta-modelo' + (plan.destacado ? ' seleccionado' : '');

      const listaCaracteristicas = plan.caracteristicas
        .map((c) => '<li>' + escaparHtml(c) + '</li>')
        .join('');

      card.innerHTML =
        '<div>' +
          '<div class="ayuda-campo" style="font-weight:600; color:var(--secundario);">' + escaparHtml(plan.etiqueta) + '</div>' +
          '<h3 class="titulo-seccion" style="margin-top:4px;">' + escaparHtml(plan.nombre) + '</h3>' +
          '<p class="subtitulo-seccion" style="margin-bottom:12px;">' + escaparHtml(plan.descripcion) + '</p>' +
          '<div style="margin-bottom:12px;">' +
            '<span class="precio-modelo">$' + escaparHtml(precio) + '</span> ' +
            '<span class="ayuda-campo">' + escaparHtml(unidad) + '</span>' +
          '</div>' +
          '<ul class="lista-simple">' + listaCaracteristicas + '</ul>' +
        '</div>' +
        '<button type="button" class="boton ' + (plan.destacado ? 'boton-primario' : 'boton-secundario') + '" style="width:100%;" data-plan-nombre="' + escaparHtml(plan.nombre) + '">' +
          escaparHtml(plan.textoBoton) +
        '</button>';

      contenedor.appendChild(card);
    });

    contenedor.querySelectorAll('[data-plan-nombre]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nombrePlan = btn.getAttribute('data-plan-nombre');
        const campoDesc = document.getElementById('rep-descripcion');
        if (campoDesc) {
          campoDesc.value = 'Solicitud de información o contratación para el plan: ' + nombrePlan + ' (' + (esAnual ? 'facturación anual' : 'por evento/mensual') + ').';
        }
        document.getElementById('formulario-reparacion').scrollIntoView({ behavior: 'smooth' });
        const clienteInput = document.getElementById('rep-cliente');
        if (clienteInput) clienteInput.focus();
        mostrarNotificacion('Plan "' + nombrePlan + '" preseleccionado en el formulario técnico.');
      });
    });
  }

  function renderizarRepuestos() {
    const contenedor = document.getElementById('rejilla-repuestos-catalogo');
    if (!contenedor || !estado.datos) return;

    const termino = estado.textoBusqueda.trim().toLowerCase();
    const repuestos = estado.datos.repuestos.filter((r) => {
      if (!termino || estado.vistaActual !== 'mantenimiento') return true;
      return (r.nombre + ' ' + r.sku + ' ' + r.descripcion).toLowerCase().includes(termino);
    });

    contenedor.innerHTML = '';

    repuestos.forEach((rep) => {
      const cantidadActual = estado.carritoRepuestos[rep.sku] || 0;
      const card = document.createElement('article');
      card.className = 'tarjeta tarjeta-repuesto';

      card.innerHTML =
        '<img src="' + escaparHtml(rep.imagen) + '" alt="' + escaparHtml(rep.alt) + '" class="imagen-repuesto" />' +
        '<div class="cuerpo-repuesto">' +
          '<div>' +
            '<div class="ayuda-campo" style="font-weight:600; color:var(--secundario);">' + escaparHtml(rep.sku) + ' · ' + escaparHtml(rep.disponibilidad) + '</div>' +
            '<h3 class="titulo-seccion" style="font-size:1rem; margin-top:4px;">' + escaparHtml(rep.nombre) + '</h3>' +
            '<p class="ayuda-campo" style="margin:6px 0 0; color:var(--texto-secundario);">' + escaparHtml(rep.descripcion) + '</p>' +
          '</div>' +
          '<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding-top:8px; border-top:1px solid var(--borde-suave);">' +
            '<strong style="font-size:1.1rem; font-variant-numeric:tabular-nums;">$' + rep.precio.toFixed(2) + '</strong>' +
            '<button type="button" class="boton boton-secundario" style="min-height:36px; padding:6px 12px;" data-agregar-repuesto="' + escaparHtml(rep.sku) + '">' +
              (cantidadActual > 0 ? 'Añadido (' + cantidadActual + ')' : 'Añadir') +
            '</button>' +
          '</div>' +
        '</div>';

      contenedor.appendChild(card);
    });

    contenedor.querySelectorAll('[data-agregar-repuesto]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sku = btn.getAttribute('data-agregar-repuesto');
        estado.carritoRepuestos[sku] = (estado.carritoRepuestos[sku] || 0) + 1;
        renderizarRepuestos();
        actualizarResumenRepuestos();
        mostrarNotificacion('Refacción ' + sku + ' añadida a la orden.');
      });
    });

    actualizarResumenRepuestos();
  }

  function actualizarResumenRepuestos() {
    if (!estado.datos) return;
    let totalPiezas = 0;
    let montoTotal = 0;

    estado.datos.repuestos.forEach((rep) => {
      const cant = estado.carritoRepuestos[rep.sku] || 0;
      totalPiezas += cant;
      montoTotal += cant * rep.precio;
    });

    const texto = totalPiezas + (totalPiezas === 1 ? ' refacción en orden' : ' refacciones en orden') + ' ($' + montoTotal.toFixed(2) + ')';
    document.getElementById('contador-repuestos').textContent = texto;
    document.getElementById('btn-solicitar-repuestos').disabled = totalPiezas === 0;
  }

  /* ------------------------------------------------------------------------
     PANTALLA 4: GESTIÓN DE PEDIDOS Y CHECKOUT (3 PASOS)
     ------------------------------------------------------------------------ */
  function irAPasoPedido(paso) {
    if (paso > 1 && !validarPasoPedido(estado.pasoPedido)) {
      return;
    }

    estado.pasoPedido = paso;
    [1, 2, 3].forEach((n) => {
      const seccion = document.getElementById('checkout-paso-' + n);
      const btn = document.getElementById('paso-btn-' + n);
      if (seccion) seccion.hidden = n !== paso;
      if (btn) {
        if (n === paso) btn.setAttribute('aria-current', 'step');
        else btn.removeAttribute('aria-current');
      }
    });

    anunciar('Paso ' + paso + ' de 3 del asistente de pedido.');
  }

  function validarPasoPedido(paso) {
    if (paso === 1) {
      const nombre = document.getElementById('ped-nombre');
      const correo = document.getElementById('ped-correo');
      const tel = document.getElementById('ped-telefono');

      if (!nombre.value.trim()) {
        nombre.focus();
        mostrarNotificacion('Ingresa el nombre completo o razón social.');
        return false;
      }
      if (!correo.value.includes('@') || !correo.value.includes('.')) {
        correo.focus();
        mostrarNotificacion('Ingresa un correo corporativo válido.');
        return false;
      }
      if (!tel.value.trim()) {
        tel.focus();
        mostrarNotificacion('Ingresa un teléfono de contacto.');
        return false;
      }
    }
    if (paso === 2) {
      const dir = document.getElementById('ped-direccion');
      const ciudad = document.getElementById('ped-ciudad');
      const cp = document.getElementById('ped-cp');
      if (!dir.value.trim() || !ciudad.value.trim() || !cp.value.trim()) {
        mostrarNotificacion('Completa la dirección, ciudad y código postal.');
        return false;
      }
    }
    return true;
  }

  function actualizarResumenPedido() {
    const selectorModelo = document.getElementById('ped-modelo');
    const opcion = selectorModelo.options[selectorModelo.selectedIndex];
    const precioUnitario = Number(opcion.getAttribute('data-precio')) || 2890;
    const nombreModelo = opcion.textContent.split('(')[0].trim();

    const inputCantidad = document.getElementById('ped-cantidad');
    const cantidad = Math.max(1, Math.min(50, parseInt(inputCantidad.value, 10) || 1));
    inputCantidad.value = cantidad;

    const acabado = document.getElementById('ped-acabado').value;
    const cp = document.getElementById('ped-cp').value.trim();

    const costoHardware = precioUnitario * cantidad;
    const descuentoFlota = cantidad >= 5 ? costoHardware * 0.12 : 0;
    const hardwareNeto = costoHardware - descuentoFlota;
    const costoEnvio = cp.length >= 4 ? 35 + cantidad * 5 : 45;
    const subtotal = hardwareNeto + costoEnvio;
    const iva = subtotal * 0.21;
    const total = subtotal + iva;
    const mensual = estado.mantenimientoEnPedido ? cantidad * 38 : 0;

    document.getElementById('res-nombre-modelo').textContent = nombreModelo;
    document.getElementById('res-detalle-hardware').textContent = cantidad + (cantidad === 1 ? ' unidad · ' : ' unidades · ') + acabado;
    document.getElementById('res-precio-hardware').textContent = formatearMoneda(hardwareNeto);
    document.getElementById('res-precio-envio').textContent = formatearMoneda(costoEnvio);
    document.getElementById('res-subtotal').textContent = formatearMoneda(subtotal);
    document.getElementById('res-iva').textContent = formatearMoneda(iva);
    document.getElementById('res-total').textContent = formatearMoneda(total);
    document.getElementById('res-recurrente').textContent = formatearMoneda(mensual) + '/mes';

    const filaMant = document.getElementById('res-fila-mantenimiento');
    if (estado.mantenimientoEnPedido) {
      filaMant.hidden = false;
      document.getElementById('res-detalle-mantenimiento').textContent = cantidad + ' u. (€ 38/mes)';
      document.getElementById('res-precio-mantenimiento').textContent = formatearMoneda(mensual) + '/mes';
    } else {
      filaMant.hidden = true;
    }
  }

  function finalizarPedido() {
    if (!validarPasoPedido(1) || !validarPasoPedido(2)) {
      irAPasoPedido(!validarPasoPedido(1) ? 1 : 2);
      return;
    }

    const selectorModelo = document.getElementById('ped-modelo');
    const nombreModelo = selectorModelo.options[selectorModelo.selectedIndex].textContent.split('(')[0].trim();
    const cantidad = parseInt(document.getElementById('ped-cantidad').value, 10) || 1;
    const nombreCliente = document.getElementById('ped-nombre').value.trim();
    const correo = document.getElementById('ped-correo').value.trim();
    const telefono = document.getElementById('ped-telefono').value.trim();
    const direccion = document.getElementById('ped-direccion').value.trim();
    const ciudad = document.getElementById('ped-ciudad').value.trim();
    const cp = document.getElementById('ped-cp').value.trim();
    const notas = document.getElementById('ped-notas').value.trim();
    const totalTexto = document.getElementById('res-total').textContent;

    const nuevoId = 'CL-' + Math.floor(1000 + Math.random() * 8999);
    const nuevoCliente = {
      id: nuevoId,
      nombre: nombreCliente,
      categoria: 'Nuevo Pedido Web',
      correo: correo,
      telefono: telefono,
      direccion: direccion + ', ' + ciudad + ', C.P. ' + cp,
      direccionCorta: direccion + ', ' + ciudad,
      contactoNombre: nombreCliente,
      contactoCargo: 'Titular de Cuenta Registrada',
      unidades: cantidad,
      modelo: nombreModelo + ' (' + totalTexto + ')',
      tieneMantenimiento: estado.mantenimientoEnPedido,
      etiquetaMantenimiento: estado.mantenimientoEnPedido ? 'Mantenimiento Activo (SLA 4 h)' : 'Solo Hardware (Sin suscripción)',
      direccionVerificada: true,
      despachoPendiente: true,
      ultimaSync: 'Registrado hoy',
      capacidadActual: 'En preparación',
      recoleccion: 'Despacho programado',
      sensorEstado: 'Pendiente de vinculación',
      firmware: 'Firmware v3.4.2',
      accesibilidad: [
        notas || 'Entrega accesible verificada en plataforma de pedido.',
        'Preferencia de contacto: ' + document.getElementById('ped-preferencia-com').value
      ],
      oportunidadEtica: {
        texto: estado.mantenimientoEnPedido
          ? 'Plan preventivo activo. Programar primera revisión óptica en 6 meses.'
          : 'Cliente optó por hardware autónomo. Respetar preferencia y brindar soporte bajo demanda si lo solicita.'
      },
      bitacora: [
        {
          titulo: 'Alta comercial desde asistente de pedidos',
          detalle: 'Orden generada por ' + cantidad + ' unidad(es) de ' + nombreModelo + '.',
          fecha: 'Hoy'
        }
      ]
    };

    try {
      const guardadas = JSON.parse(localStorage.getItem(CLAVE_VENTAS_CRM) || '[]');
      guardadas.unshift(nuevoCliente);
      localStorage.setItem(CLAVE_VENTAS_CRM, JSON.stringify(guardadas));
    } catch (_) {
      /* Continuar aunque localStorage no esté disponible */
    }

    estado.datos.clientes.unshift(nuevoCliente);
    estado.clienteSeleccionadoId = nuevoId;
    estado.paginaCrm = 1;
    renderizarListaCrm();
    renderizarDetalleCrm();

    document.getElementById('modal-ped-cliente').textContent = nombreCliente;
    document.getElementById('modal-ped-equipos').textContent = cantidad + ' × ' + nombreModelo;
    document.getElementById('modal-ped-mant').textContent = estado.mantenimientoEnPedido
      ? 'Plan Preventivo (' + formatearMoneda(cantidad * 38) + '/mes)'
      : 'No añadido (Solo hardware)';
    document.getElementById('modal-ped-total').textContent = totalTexto;

    abrirModal('modal-confirmacion-pedido', 'btn-cerrar-modal-pedido');
  }

  /* ------------------------------------------------------------------------
     PANTALLA 5: BI Y MÉTRICAS DE RECICLAJE
     ------------------------------------------------------------------------ */
  function renderizarMetricas() {
    if (!estado.datos) return;
    const bloque = estado.datos.metricasPorPeriodo[estado.periodoMetricas];
    if (!bloque) return;

    document.getElementById('met-masa').textContent = bloque.masaTotal;
    document.getElementById('met-masa-tendencia').textContent = bloque.masaTendencia;
    document.getElementById('met-co2').textContent = bloque.co2Evitado;
    document.getElementById('met-co2-eq').textContent = bloque.co2Equivalencia;
    document.getElementById('met-pureza').textContent = bloque.pureza;
    document.getElementById('met-pureza-det').textContent = bloque.purezaDetalle;
    document.getElementById('met-valor').textContent = bloque.valorRecuperado;
    document.getElementById('met-valor-det').textContent = bloque.valorDetalle;
    document.getElementById('met-precision-promedio').textContent = 'Precisión promedio: ' + bloque.precisionPromedio;
    document.getElementById('met-etiqueta-periodo').textContent = bloque.etiqueta;
    document.getElementById('met-arboles').textContent = bloque.arboles;
    document.getElementById('met-agua').textContent = bloque.agua;
    document.getElementById('met-energia').textContent = bloque.energia;
    document.getElementById('met-circularidad').textContent = 'Índice de circularidad: ' + bloque.circularidad;
    document.getElementById('met-actualizado').textContent = bloque.actualizado;

    const contenedor = document.getElementById('lista-fracciones-metricas');
    contenedor.innerHTML = '';

    bloque.fracciones.forEach((f) => {
      const item = document.createElement('div');
      item.innerHTML =
        '<div class="fraccion-cabecera">' +
          '<strong>' + escaparHtml(f.nombre) + '</strong>' +
          '<span style="font-variant-numeric:tabular-nums;">' + escaparHtml(f.ton) + ' Ton (' + escaparHtml(f.porcentaje) + '%)</span>' +
        '</div>' +
        '<div class="barra-fraccion-pista" role="progressbar" aria-label="' + escaparHtml(f.nombre) + '" aria-valuenow="' + escaparHtml(f.porcentaje) + '" aria-valuemin="0" aria-valuemax="100">' +
          '<div class="barra-fraccion-relleno ' + escaparHtml(f.color) + '" style="width:' + Number(f.porcentaje) + '%"></div>' +
        '</div>';
      contenedor.appendChild(item);
    });
  }

  function descargarCertificadoEsg() {
    if (!estado.datos) return;
    const bloque = estado.datos.metricasPorPeriodo[estado.periodoMetricas];
    const fecha = new Date().toLocaleDateString('es-ES');
    const contenido = [
      'CERTIFICADO DE IMPACTO AMBIENTAL Y TRAZABILIDAD ESG — ECOSPHERE SMART BIN IA',
      '========================================================================',
      'Fecha de emisión: ' + fecha,
      'Período auditado: ' + bloque.etiqueta,
      'Estándar aplicado: Protocolo GHG Alcance 3',
      '',
      'INDICADORES CONSOLIDADOS:',
      '- Masa total clasificada en origen: ' + bloque.masaTotal + ' toneladas',
      '- Emisiones de CO2 evitadas: ' + bloque.co2Evitado + ' toneladas equivalentes',
      '- Pureza promedio de recuperación: ' + bloque.pureza,
      '- Valor económico recuperado: ' + bloque.valorRecuperado,
      '- Índice de circularidad: ' + bloque.circularidad,
      '',
      'IMPACTO EN LA BIOSFERA:',
      '- Celulosa preservada: ' + bloque.arboles,
      '- Agua potable ahorrada: ' + bloque.agua,
      '- Energía eléctrica limpia ahorrada: ' + bloque.energia
    ].join('\n');

    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'certificado_esg_ecosphere_' + estado.periodoMetricas + '.txt';
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);
    mostrarNotificacion('Certificado ESG descargado para el período: ' + bloque.etiqueta + '.');
  }

  /* ------------------------------------------------------------------------
     MODALES ACCESIBLES (GESTIÓN DE FOCO Y TECLA ESCAPE)
     ------------------------------------------------------------------------ */
  function abrirModal(idModal, idFocoInicial) {
    const modal = document.getElementById(idModal);
    if (!modal) return;
    estado.ultimoElementoEnfocado = document.activeElement;
    modal.hidden = false;
    const focoEl = document.getElementById(idFocoInicial);
    if (focoEl) focoEl.focus();
  }

  function cerrarTodosLosModales() {
    document.querySelectorAll('.fondo-modal').forEach((m) => {
      m.hidden = true;
    });
    if (estado.ultimoElementoEnfocado && typeof estado.ultimoElementoEnfocado.focus === 'function') {
      estado.ultimoElementoEnfocado.focus();
      estado.ultimoElementoEnfocado = null;
    }
  }

  /* ------------------------------------------------------------------------
     HERRAMIENTAS DE ACCESIBILIDAD UNIVERSAL (CONTRASTE, TEXTO Y VOZ)
     ------------------------------------------------------------------------ */
  function aplicarPreferenciasAccesibilidad() {
    const html = document.documentElement;
    html.classList.toggle('alto-contraste', estado.altoContraste);
    html.classList.remove('texto-grande', 'texto-extra');
    if (estado.escalaTexto === 1) html.classList.add('texto-grande');
    if (estado.escalaTexto === 2) html.classList.add('texto-extra');

    const btnContraste = document.getElementById('btn-contraste');
    if (btnContraste) btnContraste.setAttribute('aria-pressed', estado.altoContraste ? 'true' : 'false');

    const btnTexto = document.getElementById('btn-tamano-texto');
    if (btnTexto) {
      const etiquetas = ['Tt Normal', 'Tt Grande', 'Tt Extra'];
      btnTexto.textContent = etiquetas[estado.escalaTexto] || 'Tt Normal';
      btnTexto.setAttribute('aria-pressed', estado.escalaTexto > 0 ? 'true' : 'false');
    }

    try {
      localStorage.setItem(CLAVE_PREF_ACCESIBILIDAD, JSON.stringify({
        altoContraste: estado.altoContraste,
        escalaTexto: estado.escalaTexto
      }));
    } catch (_) {
      /* Ignorar si almacenamiento bloqueado */
    }
  }

  function cargarPreferenciasAccesibilidad() {
    try {
      const pref = JSON.parse(localStorage.getItem(CLAVE_PREF_ACCESIBILIDAD) || '{}');
      estado.altoContraste = Boolean(pref.altoContraste);
      estado.escalaTexto = Number(pref.escalaTexto) || 0;
    } catch (_) {
      /* Usar valores predeterminados */
    }
    aplicarPreferenciasAccesibilidad();
  }

  function alternarLecturaVoz() {
    const btn = document.getElementById('btn-lector-voz');
    if (!('speechSynthesis' in window)) {
      mostrarNotificacion('Tu navegador no admite lectura de voz integrada.');
      return;
    }

    if (window.speechSynthesis.speaking || estado.lectorActivo) {
      window.speechSynthesis.cancel();
      estado.lectorActivo = false;
      if (btn) btn.setAttribute('aria-pressed', 'false');
      mostrarNotificacion('Lectura por voz detenida.');
      return;
    }

    const seccionActiva = document.getElementById('vista-' + estado.vistaActual);
    const titulo = seccionActiva ? seccionActiva.querySelector('h1')?.textContent : 'Consola Ecosphere';
    const descripcion = seccionActiva ? seccionActiva.querySelector('.descripcion-pagina')?.textContent : '';

    const locucion = new SpeechSynthesisUtterance(titulo + '. ' + descripcion);
    locucion.lang = 'es-ES';
    locucion.rate = 1;
    locucion.onend = () => {
      estado.lectorActivo = false;
      if (btn) btn.setAttribute('aria-pressed', 'false');
    };

    estado.lectorActivo = true;
    if (btn) btn.setAttribute('aria-pressed', 'true');
    window.speechSynthesis.speak(locucion);
  }

  /* ------------------------------------------------------------------------
     ENLACE DE EVENTOS DE INTERFAZ Y TECLADO
     ------------------------------------------------------------------------ */
  function registrarEventos() {
    // Navegación principal
    document.querySelectorAll('.enlace-menu').forEach((enlace) => {
      enlace.addEventListener('click', (evento) => {
        evento.preventDefault();
        cambiarVista(enlace.getAttribute('data-vista'), true);
      });
    });

    window.addEventListener('hashchange', gestionarRutaInicial);

    // Menú móvil
    document.getElementById('btn-menu-movil').addEventListener('click', abrirMenuMovil);
    document.getElementById('telon-movil').addEventListener('click', cerrarMenuMovil);

    // Buscador global en vivo
    document.getElementById('buscador-global').addEventListener('input', (evento) => {
      estado.textoBusqueda = evento.target.value;
      estado.paginaCrm = 1;
      if (estado.vistaActual === 'crm') renderizarListaCrm();
      else if (estado.vistaActual === 'catalogo') renderizarCatalogoModelos();
      else if (estado.vistaActual === 'mantenimiento') renderizarRepuestos();
    });

    // Accesibilidad superior
    document.getElementById('btn-contraste').addEventListener('click', () => {
      estado.altoContraste = !estado.altoContraste;
      aplicarPreferenciasAccesibilidad();
      mostrarNotificacion(estado.altoContraste ? 'Modo de alto contraste WCAG AAA activado.' : 'Modo de contraste estándar restaurado.');
    });

    document.getElementById('btn-tamano-texto').addEventListener('click', () => {
      estado.escalaTexto = (estado.escalaTexto + 1) % 3;
      aplicarPreferenciasAccesibilidad();
      const nombres = ['Tamaño de texto normal', 'Tamaño de texto grande', 'Tamaño de texto extra grande'];
      mostrarNotificacion(nombres[estado.escalaTexto] + ' aplicado.');
    });

    document.getElementById('btn-lector-voz').addEventListener('click', alternarLecturaVoz);

    // Atajos de teclado modal
    document.getElementById('btn-abrir-atajos').addEventListener('click', () => abrirModal('modal-atajos', 'btn-cerrar-atajos'));
    document.getElementById('btn-cerrar-atajos').addEventListener('click', cerrarTodosLosModales);

    // Pantalla 1: CRM
    document.querySelectorAll('[data-filtro-crm]').forEach((btn) => {
      btn.addEventListener('click', () => {
        estado.filtroCrm = btn.getAttribute('data-filtro-crm');
        estado.paginaCrm = 1;
        actualizarBotonesFiltroCrm();
        renderizarListaCrm();
      });
    });

    document.getElementById('btn-crm-anterior').addEventListener('click', () => {
      if (estado.paginaCrm > 1) {
        estado.paginaCrm--;
        renderizarListaCrm();
      }
    });

    document.getElementById('btn-crm-siguiente').addEventListener('click', () => {
      estado.paginaCrm++;
      renderizarListaCrm();
    });

    document.getElementById('btn-exportar-crm').addEventListener('click', exportarReporteCsv);
    document.getElementById('btn-ir-nuevo-pedido').addEventListener('click', () => cambiarVista('pedidos', true));

    document.getElementById('btn-enviar-cotizacion-crm').addEventListener('click', () => {
      const cliente = estado.datos.clientes.find((c) => c.id === estado.clienteSeleccionadoId);
      if (cliente) {
        mostrarNotificacion('Cotización sugerida preparada para ' + cliente.nombre + '.');
      }
    });

    document.getElementById('btn-registrar-llamada').addEventListener('click', () => {
      const cliente = estado.datos.clientes.find((c) => c.id === estado.clienteSeleccionadoId);
      if (!cliente) return;
      document.getElementById('subtitulo-modal-bitacora').textContent = cliente.nombre;
      document.getElementById('bit-titulo').value = 'Seguimiento telefónico comercial';
      document.getElementById('bit-detalle').value = '';
      abrirModal('modal-bitacora-crm', 'bit-detalle');
    });

    document.getElementById('btn-crear-ticket-crm').addEventListener('click', () => {
      const cliente = estado.datos.clientes.find((c) => c.id === estado.clienteSeleccionadoId);
      if (!cliente) return;
      document.getElementById('subtitulo-modal-bitacora').textContent = cliente.nombre;
      document.getElementById('bit-titulo').value = 'Ticket de atención técnica SLA';
      document.getElementById('bit-detalle').value = '';
      abrirModal('modal-bitacora-crm', 'bit-detalle');
    });

    document.getElementById('btn-cancelar-bitacora').addEventListener('click', cerrarTodosLosModales);
    document.getElementById('form-bitacora-crm').addEventListener('submit', (evento) => {
      evento.preventDefault();
      const cliente = estado.datos.clientes.find((c) => c.id === estado.clienteSeleccionadoId);
      if (!cliente) return;
      const titulo = document.getElementById('bit-titulo').value.trim();
      const detalle = document.getElementById('bit-detalle').value.trim();
      if (!titulo || !detalle) return;

      cliente.bitacora = cliente.bitacora || [];
      cliente.bitacora.unshift({
        titulo: titulo,
        detalle: detalle,
        fecha: 'Justo ahora'
      });
      renderizarDetalleCrm();
      cerrarTodosLosModales();
      mostrarNotificacion('Registro añadido a la bitácora de ' + cliente.nombre + '.');
    });

    // Pantalla 2: Catálogo y Configurador
    document.querySelectorAll('[data-paso-diagrama], [data-tarjeta-diagrama]').forEach((el) => {
      el.addEventListener('click', () => {
        const paso = el.getAttribute('data-paso-diagrama') || el.getAttribute('data-tarjeta-diagrama');
        seleccionarPasoDiagrama(paso);
      });
    });

    document.getElementById('btn-cfg-menos').addEventListener('click', () => {
      const input = document.getElementById('cfg-unidades');
      input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
      actualizarResumenConfigurador();
    });

    document.getElementById('btn-cfg-mas').addEventListener('click', () => {
      const input = document.getElementById('cfg-unidades');
      input.value = Math.min(100, (parseInt(input.value, 10) || 1) + 1);
      actualizarResumenConfigurador();
    });

    document.getElementById('cfg-unidades').addEventListener('input', actualizarResumenConfigurador);

    document.getElementById('btn-cfg-mant-no').addEventListener('click', () => {
      estado.mantenimientoEnConfigurador = false;
      document.getElementById('btn-cfg-mant-no').setAttribute('aria-checked', 'true');
      document.getElementById('btn-cfg-mant-si').setAttribute('aria-checked', 'false');
      actualizarResumenConfigurador();
    });

    document.getElementById('btn-cfg-mant-si').addEventListener('click', () => {
      estado.mantenimientoEnConfigurador = true;
      document.getElementById('btn-cfg-mant-no').setAttribute('aria-checked', 'false');
      document.getElementById('btn-cfg-mant-si').setAttribute('aria-checked', 'true');
      actualizarResumenConfigurador();
    });

    document.getElementById('btn-pasar-checkout').addEventListener('click', () => {
      const selector = document.getElementById('ped-modelo');
      selector.value = estado.modeloConfiguradorId;
      document.getElementById('ped-cantidad').value = document.getElementById('cfg-unidades').value;
      estado.mantenimientoEnPedido = estado.mantenimientoEnConfigurador;
      document.getElementById('btn-ped-mant-no').setAttribute('aria-checked', estado.mantenimientoEnPedido ? 'false' : 'true');
      document.getElementById('btn-ped-mant-si').setAttribute('aria-checked', estado.mantenimientoEnPedido ? 'true' : 'false');

      const destino = document.getElementById('cfg-destino').value.trim();
      if (destino) document.getElementById('ped-ciudad').value = destino;

      actualizarResumenPedido();
      cambiarVista('pedidos', true);
      mostrarNotificacion('Configuración transferida al asistente de pedidos.');
    });

    // Pantalla 3: Mantenimiento
    document.getElementById('btn-facturacion-anual').addEventListener('click', () => {
      estado.modalidadFacturacion = 'anual';
      document.getElementById('btn-facturacion-anual').setAttribute('aria-pressed', 'true');
      document.getElementById('btn-facturacion-evento').setAttribute('aria-pressed', 'false');
      renderizarPlanesMantenimiento();
    });

    document.getElementById('btn-facturacion-evento').addEventListener('click', () => {
      estado.modalidadFacturacion = 'evento';
      document.getElementById('btn-facturacion-anual').setAttribute('aria-pressed', 'false');
      document.getElementById('btn-facturacion-evento').setAttribute('aria-pressed', 'true');
      renderizarPlanesMantenimiento();
    });

    document.getElementById('btn-solicitar-repuestos').addEventListener('click', () => {
      const resumen = Object.entries(estado.carritoRepuestos)
        .filter(([, cant]) => cant > 0)
        .map(([sku, cant]) => cant + ' × ' + sku)
        .join(', ');
      estado.carritoRepuestos = {};
      renderizarRepuestos();
      mostrarNotificacion('Orden de refacciones confirmada: ' + resumen + '.');
    });

    document.getElementById('btn-asistencia-especialista').addEventListener('click', () => {
      mostrarNotificacion('Enlace de soporte directo solicitado. Línea prioritaria: +52 55 8000 2410.');
    });

    document.getElementById('btn-dictar-falla').addEventListener('click', () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        mostrarNotificacion('El dictado por voz no está disponible en este navegador. Puedes escribir el reporte directamente.');
        return;
      }
      const reconocimiento = new SpeechRecognition();
      reconocimiento.lang = 'es-ES';
      const btn = document.getElementById('btn-dictar-falla');
      btn.textContent = 'Escuchando...';
      reconocimiento.onresult = (ev) => {
        const texto = ev.results[0][0].transcript;
        const campo = document.getElementById('rep-descripcion');
        campo.value = campo.value ? campo.value + ' ' + texto : texto;
        btn.textContent = 'Dictar por voz';
      };
      reconocimiento.onerror = () => {
        btn.textContent = 'Dictar por voz';
        mostrarNotificacion('No se pudo capturar audio del micrófono.');
      };
      reconocimiento.start();
    });

    document.getElementById('form-solicitud-reparacion').addEventListener('submit', (evento) => {
      evento.preventDefault();
      const cliente = document.getElementById('rep-cliente');
      const serial = document.getElementById('rep-serial');
      const desc = document.getElementById('rep-descripcion');

      const errCliente = document.getElementById('error-rep-cliente');
      const errSerial = document.getElementById('error-rep-serial');
      const errDesc = document.getElementById('error-rep-descripcion');

      let valido = true;
      [
        [cliente, errCliente, 'Indica el nombre del cliente o empresa.'],
        [serial, errSerial, 'Indica el número de serie del equipo.'],
        [desc, errDesc, 'Describe brevemente la anomalía observada.']
      ].forEach(([campo, err, mensaje]) => {
        if (!campo.value.trim()) {
          campo.classList.add('invalido');
          err.textContent = mensaje;
          err.hidden = false;
          if (valido) campo.focus();
          valido = false;
        } else {
          campo.classList.remove('invalido');
          err.hidden = true;
        }
      });

      if (!valido) return;

      const folio = 'TK-' + Math.floor(1000 + Math.random() * 8999);
      const cajaConf = document.getElementById('confirmacion-reparacion');
      document.getElementById('titulo-ticket-reparacion').textContent = 'Incidencia #' + folio + ' registrada correctamente';
      document.getElementById('texto-ticket-reparacion').textContent =
        'Equipo ' + serial.value.trim() + ' (' + cliente.value.trim() + '). Un técnico certificado revisará el diagnóstico en menos de 20 minutos.';
      cajaConf.hidden = false;
      anunciar('Incidencia ' + folio + ' registrada.');
    });

    // Pantalla 4: Pedidos y Checkout
    document.querySelectorAll('[data-ir-paso]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const paso = parseInt(btn.getAttribute('data-ir-paso'), 10);
        irAPasoPedido(paso);
      });
    });

    document.getElementById('ped-correo').addEventListener('input', (evento) => {
      const val = evento.target.value;
      const estadoCorreo = document.getElementById('estado-correo-pedido');
      if (val.includes('@') && val.includes('.')) {
        estadoCorreo.textContent = 'Formato de correo válido';
        estadoCorreo.style.color = 'var(--primario)';
      } else {
        estadoCorreo.textContent = 'Ingresa un correo electrónico completo';
        estadoCorreo.style.color = 'var(--peligro)';
      }
    });

    ['ped-modelo', 'ped-cantidad', 'ped-acabado', 'ped-cp'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', actualizarResumenPedido);
      if (el) el.addEventListener('change', actualizarResumenPedido);
    });

    document.getElementById('btn-ped-menos').addEventListener('click', () => {
      const input = document.getElementById('ped-cantidad');
      input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
      actualizarResumenPedido();
    });

    document.getElementById('btn-ped-mas').addEventListener('click', () => {
      const input = document.getElementById('ped-cantidad');
      input.value = Math.min(50, (parseInt(input.value, 10) || 1) + 1);
      actualizarResumenPedido();
    });

    document.getElementById('btn-ped-mant-no').addEventListener('click', () => {
      estado.mantenimientoEnPedido = false;
      document.getElementById('btn-ped-mant-no').setAttribute('aria-checked', 'true');
      document.getElementById('btn-ped-mant-si').setAttribute('aria-checked', 'false');
      actualizarResumenPedido();
    });

    document.getElementById('btn-ped-mant-si').addEventListener('click', () => {
      estado.mantenimientoEnPedido = true;
      document.getElementById('btn-ped-mant-no').setAttribute('aria-checked', 'false');
      document.getElementById('btn-ped-mant-si').setAttribute('aria-checked', 'true');
      actualizarResumenPedido();
    });

    document.getElementById('btn-enfocar-resumen').addEventListener('click', () => {
      document.getElementById('btn-finalizar-pedido').focus();
    });

    document.getElementById('btn-finalizar-pedido').addEventListener('click', finalizarPedido);
    document.getElementById('btn-guardar-cotizacion').addEventListener('click', () => {
      const folio = 'QT-' + Math.floor(100 + Math.random() * 899);
      mostrarNotificacion('Cotización formal #' + folio + ' guardada.');
    });

    document.getElementById('btn-cerrar-modal-pedido').addEventListener('click', () => {
      cerrarTodosLosModales();
      cambiarVista('crm', true);
    });

    // Pantalla 5: Métricas
    document.querySelectorAll('.btn-periodo-metricas').forEach((btn) => {
      btn.addEventListener('click', () => {
        estado.periodoMetricas = btn.getAttribute('data-periodo');
        document.querySelectorAll('.btn-periodo-metricas').forEach((b) => {
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        renderizarMetricas();
        anunciar('Métricas actualizadas para ' + btn.textContent);
      });
    });

    document.getElementById('btn-descargar-esg').addEventListener('click', descargarCertificadoEsg);

    // Atajos globales de teclado (WCAG 2.1.4 / navegabilidad eficiente)
    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') {
        cerrarTodosLosModales();
        cerrarMenuMovil();
        return;
      }

      const etiquetaActiva = document.activeElement ? document.activeElement.tagName : '';
      const escribiendo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(etiquetaActiva);
      if (escribiendo) return;

      const mapaVistas = { '1': 'crm', '2': 'catalogo', '3': 'mantenimiento', '4': 'pedidos', '5': 'metricas' };
      if (mapaVistas[evento.key]) {
        evento.preventDefault();
        cambiarVista(mapaVistas[evento.key], true);
      } else if (evento.key === '/') {
        evento.preventDefault();
        document.getElementById('buscador-global').focus();
      } else if (evento.key === '?') {
        evento.preventDefault();
        const modal = document.getElementById('modal-atajos');
        if (modal.hidden) abrirModal('modal-atajos', 'btn-cerrar-atajos');
        else cerrarTodosLosModales();
      }
    });
  }

  cargarPreferenciasAccesibilidad();
  registrarEventos();
  cargarDatos();
})();
