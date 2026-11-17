/*
 * A roda 3D da abertura, desenhada inteira em código (sem modelo baixado):
 *   pneu de perfil baixo com sulcos na banda e inscrição na lateral;
 *   aro de cinco raios duplos, côncavo, preto brilhante com corte diamantado;
 *   cubo com porcas, tampa e anel aceso; válvula;
 *   disco de freio furado e pinça azul (a pinça não gira).
 * Os reflexos vêm de um "estúdio" de luzes montado aqui mesmo.
 *
 * Usado por js/aro3d.js. Recebe o THREE já carregado.
 */
export function criarCena(THREE, renderer) {
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 5.8);

  cena.environment = reflexos(THREE, renderer);
  cena.environmentIntensity = 1.25;

  // Luzes de recorte: a borracha quase não reflete o estúdio.
  const recorte = new THREE.DirectionalLight(0xffffff, 2.2);
  recorte.position.set(-3, 4, 4);
  const recorteAzul = new THREE.DirectionalLight(0x3d8bff, 2.6);
  recorteAzul.position.set(4, -1, 2);
  const frente = new THREE.DirectionalLight(0xffffff, 0.7);
  frente.position.set(0.5, 0.5, 5);
  cena.add(recorte, recorteAzul, frente);

  const anisotropia = renderer.capabilities.getMaxAnisotropy();

  /* Materiais ------------------------------------------------------------- */
  const cromo = new THREE.MeshPhysicalMaterial({ color: 0xe4e8ee, metalness: 1, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 });
  const pretoBrilho = new THREE.MeshPhysicalMaterial({ color: 0x2b3038, metalness: 0.85, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03 });
  const tambor = new THREE.MeshPhysicalMaterial({ color: 0x1b1f26, metalness: 0.9, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
  const acoEscovado = new THREE.MeshStandardMaterial({ color: 0x8b929c, metalness: 1, roughness: 0.42 });
  const fundo = new THREE.MeshBasicMaterial({ color: 0x020305 });
  const pinca = new THREE.MeshPhysicalMaterial({ color: 0x1857e6, metalness: 0.3, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05 });
  const aceso = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x36cfff).multiplyScalar(2.4) });

  const texturaPneu = desenharPneu(THREE, anisotropia);
  const borracha = new THREE.MeshStandardMaterial({
    color: 0x1a1c20,
    roughness: 0.78,
    metalness: 0,
    map: texturaPneu.cor,
    bumpMap: texturaPneu.relevo,
    bumpScale: 2.2,
    side: THREE.DoubleSide,
  });

  const texturaDisco = desenharDisco(THREE, anisotropia);
  const disco = new THREE.MeshStandardMaterial({ color: 0x6d737c, metalness: 1, roughness: 0.36, map: texturaDisco, bumpMap: texturaDisco, bumpScale: 0.6 });

  const roda = new THREE.Group(); // gira
  const conjunto = new THREE.Group(); // inclina com o mouse

  /* Pneu ------------------------------------------------------------------
     Perfil (raio, largura) de ombro arredondado, girado em volta do eixo.
     Os pontos têm espaçamento parecido para a textura não esticar: a faixa
     do meio é a banda de rodagem; as duas pontas são as laterais. */
  const perfilPneu = [];
  const RAIO_TALAO = 0.87;
  const RAIO_BANDA = 1.13;
  const MEIA_LARGURA = 0.33;
  const lateral = 9;
  const banda = 14;
  for (let i = 0; i <= lateral; i++) {
    // lateral da frente: do talão até o ombro, levemente abaulada
    const t = i / lateral;
    const r = RAIO_TALAO + (RAIO_BANDA - 0.045 - RAIO_TALAO) * t;
    const z = MEIA_LARGURA - 0.05 + 0.04 * Math.sin(Math.PI * Math.min(t * 1.15, 1)) - 0.03 * Math.pow(t, 6);
    perfilPneu.push(new THREE.Vector2(r, z));
  }
  for (let i = 1; i < banda; i++) {
    // banda: quase plana, com os ombros caindo
    const t = i / banda;
    const u = t * 2 - 1;
    const r = RAIO_BANDA - 0.045 * Math.pow(Math.abs(u), 5);
    perfilPneu.push(new THREE.Vector2(r, -u * (MEIA_LARGURA - 0.035)));
  }
  for (let i = lateral; i >= 0; i--) {
    const p = perfilPneu[i];
    perfilPneu.push(new THREE.Vector2(p.x, -p.y));
  }
  const pneu = new THREE.Mesh(new THREE.LatheGeometry(perfilPneu, 220), borracha);
  pneu.rotation.x = Math.PI / 2;
  roda.add(pneu);

  /* Aro: tambor, degrau e borda polida ------------------------------------ */
  const perfilAro = [
    [0.9, 0.262], [0.905, 0.285], [0.888, 0.3], [0.866, 0.296], [0.852, 0.272],
    [0.842, 0.2], [0.826, 0.16], [0.8, 0.14], [0.79, 0.02], [0.78, -0.28], [0.9, -0.3],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const aro = new THREE.Mesh(new THREE.LatheGeometry(perfilAro, 220), tambor);
  aro.rotation.x = Math.PI / 2;
  roda.add(aro);

  const perfilBorda = [[0.905, 0.285], [0.892, 0.303], [0.868, 0.3], [0.853, 0.275], [0.845, 0.215]].map(([r, z]) => new THREE.Vector2(r, z));
  const borda = new THREE.Mesh(new THREE.LatheGeometry(perfilBorda, 220), cromo);
  borda.rotation.x = Math.PI / 2;
  borda.scale.setScalar(1.002);
  roda.add(borda);

  /* Fundo escuro atrás dos raios, para o vão não mostrar a página */
  const vao = new THREE.Mesh(new THREE.CircleGeometry(0.8, 96), fundo);
  vao.position.z = -0.27;
  roda.add(vao);

  /* Disco de freio furado, com o chapéu no centro -------------------------- */
  const discoFreio = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.04, 128), [acoEscovado, disco, disco]);
  discoFreio.rotation.x = Math.PI / 2;
  discoFreio.position.z = -0.07;
  roda.add(discoFreio);

  const chapeu = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.09, 64), new THREE.MeshStandardMaterial({ color: 0x23272e, metalness: 0.8, roughness: 0.5 }));
  chapeu.rotation.x = Math.PI / 2;
  chapeu.position.z = -0.01;
  roda.add(chapeu);

  /* Raios: cinco pares que nascem juntos no cubo e abrem até o aro.
     Cada raio é uma lâmina afilada, curvada para dentro (aro côncavo). */
  const PASSOS = 14;
  const R0 = 0.16;
  const R1 = 0.815;
  function formaDoRaio() {
    const esquerda = [];
    const direita = [];
    for (let i = 0; i <= PASSOS; i++) {
      const t = i / PASSOS;
      const y = R0 + (R1 - R0) * t;
      const meia = 0.052 - 0.024 * t + 0.02 * Math.pow(t, 5); // afina e abre de novo no aro
      esquerda.push(new THREE.Vector2(-meia, y));
      direita.push(new THREE.Vector2(meia, y));
    }
    return new THREE.Shape(direita.concat(esquerda.reverse()));
  }
  const geometriaRaio = new THREE.ExtrudeGeometry(formaDoRaio(), {
    depth: 0.075,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.016,
    bevelSegments: 4,
    curveSegments: 1,
  });
  geometriaRaio.translate(0, 0, -0.0375);
  // Curva: sai alto do cubo, mergulha no meio e sobe até a borda do aro.
  const pos = geometriaRaio.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(Math.max((pos.getY(i) - R0) / (R1 - R0), 0), 1);
    const curva = 0.16 - 0.2 * Math.sin(Math.PI * Math.pow(t, 0.8) * 0.62) + 0.14 * Math.pow(t, 3);
    pos.setZ(i, pos.getZ(i) + curva);
    // abre o par: o raio se afasta do centro do par à medida que sobe
    pos.setX(i, pos.getX(i) + 0.085 * Math.pow(t, 1.3));
  }
  geometriaRaio.computeVertexNormals();
  for (let par = 0; par < 5; par++) {
    for (const lado of [-1, 1]) {
      const eixo = new THREE.Group();
      eixo.rotation.z = (par / 5) * Math.PI * 2;
      eixo.scale.x = lado;
      const raio = new THREE.Mesh(geometriaRaio, [pretoBrilho, cromo]);
      eixo.add(raio);
      roda.add(eixo);
    }
  }

  /* Cubo, porcas, tampa e anel aceso --------------------------------------- */
  const perfilCubo = [[0, 0.215], [0.085, 0.215], [0.1, 0.2], [0.215, 0.185], [0.245, 0.15], [0.26, 0.06], [0.26, 0]].map(([r, z]) => new THREE.Vector2(r, z));
  const cubo = new THREE.Mesh(new THREE.LatheGeometry(perfilCubo, 96), pretoBrilho);
  cubo.rotation.x = Math.PI / 2;
  roda.add(cubo);

  const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.082, 0.02, 48), cromo);
  tampa.rotation.x = Math.PI / 2;
  tampa.position.z = 0.222;
  roda.add(tampa);

  const anel = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.006, 8, 96), aceso);
  anel.position.z = 0.22;
  roda.add(anel);

  const geometriaPorca = new THREE.CylinderGeometry(0.027, 0.03, 0.06, 6);
  const geometriaFuro = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 24);
  for (let i = 0; i < 5; i++) {
    const angulo = (i / 5) * Math.PI * 2 + Math.PI / 5;
    const x = Math.cos(angulo) * 0.165;
    const y = Math.sin(angulo) * 0.165;
    const furo = new THREE.Mesh(geometriaFuro, fundo);
    furo.rotation.x = Math.PI / 2;
    furo.position.set(x, y, 0.186);
    const porca = new THREE.Mesh(geometriaPorca, cromo);
    porca.rotation.x = Math.PI / 2;
    porca.rotation.y = angulo;
    porca.position.set(x, y, 0.2);
    roda.add(furo, porca);
  }

  /* Válvula ---------------------------------------------------------------- */
  const valvula = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.07, 12), cromo);
  valvula.position.set(Math.cos(0.32) * 0.8, Math.sin(0.32) * 0.8, 0.17);
  valvula.rotation.set(Math.PI / 2 - 0.5, 0, 0.32 - Math.PI / 2);
  roda.add(valvula);

  /* Pinça de freio: fica parada enquanto a roda gira ------------------------ */
  const pincaFreio = new THREE.Group();
  const formaPinca = new THREE.Shape();
  formaPinca.absarc(0, 0, 0.745, 0.22, 1.12, false);
  formaPinca.absarc(0, 0, 0.5, 1.12, 0.22, true);
  const corpo = new THREE.Mesh(
    new THREE.ExtrudeGeometry(formaPinca, { depth: 0.15, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.026, bevelSegments: 5, curveSegments: 32 }),
    pinca,
  );
  corpo.position.z = -0.135;
  pincaFreio.add(corpo);
  // ponte central rebaixada e dois parafusos, como numa pinça de pistões opostos
  const formaPonte = new THREE.Shape();
  formaPonte.absarc(0, 0, 0.7, 0.5, 0.84, false);
  formaPonte.absarc(0, 0, 0.55, 0.84, 0.5, true);
  const ponte = new THREE.Mesh(
    new THREE.ExtrudeGeometry(formaPonte, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 16 }),
    new THREE.MeshPhysicalMaterial({ color: 0x0f3fb0, metalness: 0.3, roughness: 0.35, clearcoat: 1 }),
  );
  ponte.position.z = 0.04;
  pincaFreio.add(ponte);
  for (const angulo of [0.33, 1.01]) {
    const parafuso = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 6), acoEscovado);
    parafuso.rotation.x = Math.PI / 2;
    parafuso.position.set(Math.cos(angulo) * 0.625, Math.sin(angulo) * 0.625, 0.052);
    pincaFreio.add(parafuso);
  }

  conjunto.add(roda, pincaFreio);
  conjunto.rotation.set(0.05, -0.42, 0);
  cena.add(conjunto);

  return { cena, camera, conjunto, roda };
}

/*
 * Textura do pneu. No torno, o eixo horizontal da imagem dá a volta no pneu
 * e o vertical percorre o perfil: lateral da frente, banda, lateral de trás.
 * Devolve a cor (inscrição um pouco mais clara) e o relevo (sulcos fundos).
 */
function desenharPneu(THREE, anisotropia) {
  const L = 2048;
  const A = 512;
  const cor = document.createElement('canvas');
  const relevo = document.createElement('canvas');
  cor.width = relevo.width = L;
  cor.height = relevo.height = A;
  const c = cor.getContext('2d');
  const r = relevo.getContext('2d');

  // As faixas seguem a contagem de pontos do perfil: 9 + 14 + 9 trechos.
  const fimLateral = (9 / 32) * A;
  const fimBanda = (23 / 32) * A;

  c.fillStyle = '#8f8f8f';
  c.fillRect(0, 0, L, A);
  r.fillStyle = '#808080';
  r.fillRect(0, 0, L, A);

  // Banda: quatro sulcos em volta e cortes inclinados nos blocos.
  r.fillStyle = '#8c8c8c';
  r.fillRect(0, fimLateral, L, fimBanda - fimLateral);
  r.fillStyle = '#101010';
  c.fillStyle = '#3c3c3c';
  const alturaBanda = fimBanda - fimLateral;
  for (const f of [0.2, 0.4, 0.6, 0.8]) {
    const y = fimLateral + alturaBanda * f;
    r.fillRect(0, y - 5, L, 10);
    c.fillRect(0, y - 5, L, 10);
  }
  r.strokeStyle = '#1c1c1c';
  c.strokeStyle = '#4a4a4a';
  r.lineWidth = c.lineWidth = 3;
  const CORTES = 96;
  for (let i = 0; i < CORTES; i++) {
    const x = (i / CORTES) * L;
    for (const [de, ate, inclina] of [[0, 0.2, 14], [0.2, 0.4, -9], [0.6, 0.8, 9], [0.8, 1, -14]]) {
      for (const ctx of [r, c]) {
        ctx.beginPath();
        ctx.moveTo(x, fimLateral + alturaBanda * de);
        ctx.lineTo(x + inclina, fimLateral + alturaBanda * ate);
        ctx.stroke();
      }
    }
  }

  // Laterais: frisos concêntricos e a inscrição em relevo.
  for (const [topo, base, espelho] of [[0, fimLateral, false], [fimBanda, A, true]]) {
    const alto = base - topo;
    r.fillStyle = '#9a9a9a';
    for (const f of [0.12, 0.2, 0.82, 0.9]) {
      r.fillRect(0, topo + alto * f, L, 3);
    }
    for (const ctx of [r, c]) {
      ctx.save();
      ctx.translate(0, topo + alto * 0.52);
      ctx.scale(-1, espelho ? 1 : -1); // lê certo de fora, com o topo das letras para a banda
      ctx.fillStyle = ctx === r ? '#c8c8c8' : '#c2c2c2';
      ctx.textBaseline = 'middle';
      ctx.font = '700 46px "Archivo", "Arial Black", Arial, sans-serif';
      if ('fontStretch' in ctx) ctx.fontStretch = 'expanded';
      const frases = ['GH PERFORMANCE', '245/35 ZR20', 'ULTRA GRIP', '245/35 ZR20'];
      frases.forEach((frase, i) => {
        ctx.textAlign = 'center';
        ctx.fillText(frase, -(i + 0.5) * (L / frases.length), 0);
      });
      ctx.restore();
    }
  }

  function textura(canvas, colorida) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.anisotropy = anisotropia;
    if (colorida) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  return { cor: textura(cor, true), relevo: textura(relevo, false) };
}

/* Face do disco: riscos circulares de uso e furos de ventilação em espiral. */
function desenharDisco(THREE, anisotropia) {
  const T = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = T;
  const c = canvas.getContext('2d');
  const m = T / 2;
  c.fillStyle = '#a8a8a8';
  c.fillRect(0, 0, T, T);
  let semente = 11;
  const acaso = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    c.beginPath();
    c.arc(m, m, m * (0.42 + acaso() * 0.58), 0, Math.PI * 2);
    c.strokeStyle = `rgba(${acaso() > 0.5 ? '255,255,255' : '40,40,40'},${0.05 + acaso() * 0.12})`;
    c.lineWidth = 0.6 + acaso() * 1.6;
    c.stroke();
  }
  c.fillStyle = '#141414';
  for (let braco = 0; braco < 24; braco++) {
    for (let k = 0; k < 4; k++) {
      const angulo = (braco / 24) * Math.PI * 2 + k * 0.085;
      const raio = m * (0.52 + k * 0.125);
      c.beginPath();
      c.arc(m + Math.cos(angulo) * raio, m + Math.sin(angulo) * raio, 7, 0, Math.PI * 2);
      c.fill();
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.anisotropy = anisotropia;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/*
 * Estúdio de luz só para os reflexos do metal: um softbox grande em cima,
 * faixas brancas à esquerda, uma faixa azul à direita e um brilho ciano
 * embaixo. Faixas estreitas dão os riscos de luz típicos de foto de carro.
 */
function reflexos(THREE, renderer) {
  const estudio = new THREE.Scene();
  estudio.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x06070a, side: THREE.BackSide })));

  function painel(largura, altura, cor, intensidade, x, y, z) {
    const luz = new THREE.Mesh(
      new THREE.PlaneGeometry(largura, altura),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(intensidade), side: THREE.DoubleSide }),
    );
    luz.position.set(x, y, z);
    luz.lookAt(0, 0, 0);
    estudio.add(luz);
  }

  painel(14, 4, 0xffffff, 9, 0, 7, 3);
  painel(1.4, 10, 0xffffff, 8, -7, 0, 4);
  painel(0.6, 10, 0xffffff, 6, -5, 1, 7);
  painel(2.2, 10, 0x2f7bff, 13, 7, 0, 3);
  painel(8, 1.5, 0x36cfff, 3.5, 0, -6, 4);
  painel(5, 5, 0xffffff, 2.4, -2, 2, 8.5);
  painel(2, 6, 0xdfe8ff, 1.6, 4, 2, 8);

  const gerador = new THREE.PMREMGenerator(renderer);
  const textura = gerador.fromScene(estudio, 0.02).texture;
  gerador.dispose();
  return textura;
}
