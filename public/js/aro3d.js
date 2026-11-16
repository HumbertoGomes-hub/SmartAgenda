/*
 * Aro 3D da abertura (cena em js/aro3d-cena.js, Three.js em public/vendor/).
 *
 * Só liga quando vale a pena: com WebGL, sem economia de dados e em aparelho
 * com fôlego. Nos outros casos fica a imagem da mesma roda
 * (img/aro-3d.webp), que já está na página.
 *
 * A roda gira devagar, inclina na direção do mouse, pode ser girada
 * arrastando (com inércia) e para de desenhar quando sai da tela ou a aba
 * fica em segundo plano.
 *
 * Com "menos movimento" pedido no sistema (no Windows, "Efeitos de animação"
 * desligados), a roda continua em 3D, mas gira bem mais devagar e não
 * acompanha o mouse: só se mexe de verdade quando a pessoa a arrasta.
 */
const palco = document.querySelector('.abertura__palco');
const tela = document.getElementById('aro-3d');
const menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function podeRodar() {
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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
      if (menosMovimento) return;
      alvoX = (evento.clientX / window.innerWidth - 0.5) * 0.5;
      alvoY = (evento.clientY / window.innerHeight - 0.5) * 0.3;
    },
    { passive: true },
  );

  // Arrastar gira a roda; ao soltar, ela segue com o impulso e volta ao ritmo.
  const RITMO = menosMovimento ? -0.07 : -0.35; // voltas lentas, em rad/s
  let velocidade = RITMO;
  let arrasto = null;
  function anguloDoPonteiro(evento) {
    const caixa = tela.getBoundingClientRect();
    return Math.atan2(evento.clientY - (caixa.top + caixa.height / 2), evento.clientX - (caixa.left + caixa.width / 2));
  }
  tela.addEventListener('pointerdown', (evento) => {
    arrasto = { angulo: anguloDoPonteiro(evento), tempo: performance.now() };
    tela.setPointerCapture(evento.pointerId);
    tela.dataset.arrastando = 'true';
  });
  tela.addEventListener('pointermove', (evento) => {
    if (!arrasto) return;
    const angulo = anguloDoPonteiro(evento);
    const agora = performance.now();
    let delta = angulo - arrasto.angulo;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    roda.rotation.z -= delta; // a tela cresce para baixo; a cena, para cima
    const dt = Math.max((agora - arrasto.tempo) / 1000, 0.008);
    velocidade = Math.max(Math.min(-delta / dt, 14), -14);
    arrasto = { angulo, tempo: agora };
  });
  const soltar = () => {
    arrasto = null;
    delete tela.dataset.arrastando;
  };
  tela.addEventListener('pointerup', soltar);
  tela.addEventListener('pointercancel', soltar);

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
    if (!arrasto) {
      velocidade += (RITMO - velocidade) * Math.min(passo * 1.1, 1); // o impulso se desfaz
      roda.rotation.z += velocidade * passo;
    }
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
