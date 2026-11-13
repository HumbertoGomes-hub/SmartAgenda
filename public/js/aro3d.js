/*
 * Aro 3D da abertura (cena em js/aro3d-cena.js, Three.js em public/vendor/).
 *
 * Só liga quando vale a pena: com WebGL, sem pedido de menos movimento, sem
 * economia de dados e em aparelho com fôlego. Nos outros casos fica a imagem
 * da mesma roda (img/aro-3d.webp), que já está na página.
 *
 * A roda gira devagar, inclina na direção do mouse e para de desenhar
 * quando sai da tela ou a aba fica em segundo plano.
 */
const palco = document.querySelector('.abertura__palco');
const tela = document.getElementById('aro-3d');

function podeRodar() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (navigator.connection && navigator.connection.saveData) return false;
  if ((navigator.hardwareConcurrency || 8) < 4) return false;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch (erro) {
    return false;
  }
}

async function iniciar() {
  const THREE = await import('../vendor/three/three.module.min.js');
  const { criarCena } = await import('./aro3d-cena.js');

  const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const { cena, camera, conjunto, roda } = criarCena(THREE, renderer);
  const base = { x: conjunto.rotation.x, y: conjunto.rotation.y };

  function medir() {
    const largura = palco.clientWidth;
    const altura = palco.clientHeight;
    if (!largura || !altura) return;
    renderer.setSize(largura, altura, false);
    camera.aspect = largura / altura;
    camera.updateProjectionMatrix();
  }
  medir();
  new ResizeObserver(medir).observe(palco);

  // Inclinação para onde o mouse está, com atraso suave.
  let alvoX = 0;
  let alvoY = 0;
  let inclX = 0;
  let inclY = 0;
  window.addEventListener(
    'pointermove',
    (evento) => {
      alvoX = (evento.clientX / window.innerWidth - 0.5) * 0.5;
      alvoY = (evento.clientY / window.innerHeight - 0.5) * 0.3;
    },
    { passive: true },
  );

  let visivel = true;
  let rodando = false;
  let antes = 0;

  function quadro(agora) {
    if (!visivel || document.hidden) {
      rodando = false;
      return;
    }
    const passo = Math.min((agora - antes) / 1000, 0.05);
    antes = agora;
    roda.rotation.z -= passo * 0.35;
    inclX += (alvoY - inclX) * 0.05;
    inclY += (alvoX - inclY) * 0.05;
    conjunto.rotation.x = base.x + inclX;
    conjunto.rotation.y = base.y + inclY;
    renderer.render(cena, camera);
    if (palco.dataset['3d'] !== 'pronto') {
      palco.dataset['3d'] = 'pronto';
    }
    requestAnimationFrame(quadro);
  }

  function retomar() {
    if (!rodando && visivel && !document.hidden) {
      rodando = true;
      antes = performance.now();
      requestAnimationFrame(quadro);
    }
  }

  new IntersectionObserver((entradas) => {
    visivel = entradas[0].isIntersecting;
    retomar();
  }).observe(palco);
  document.addEventListener('visibilitychange', retomar);
  retomar();
}

if (palco && tela && podeRodar()) {
  // Depois do carregamento, para o 3D não atrasar o resto da página.
  const comecar = () => iniciar().catch(() => {
    // Sem 3D, a imagem da roda continua no lugar.
  });
  if (document.readyState === 'complete') {
    setTimeout(comecar, 0);
  } else {
    window.addEventListener('load', () => setTimeout(comecar, 0), { once: true });
  }
}
