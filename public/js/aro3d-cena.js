/*
 * A roda 3D da abertura: pneu, aro cromado com raios duplos, cubo com anel
 * aceso, disco de freio e pinça azul. Tudo desenhado em código (sem modelo
 * baixado), com reflexos de um "estúdio" de luzes montado aqui mesmo.
 *
 * Usado por js/aro3d.js. Recebe o THREE já carregado.
 */
export function criarCena(THREE, renderer) {
  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 5.8);

  cena.environment = reflexos(THREE, renderer);
  cena.environmentIntensity = 1.35;

  // Luz de recorte para o pneu ganhar volume (borracha quase não reflete).
  const recorte = new THREE.DirectionalLight(0xffffff, 1.6);
  recorte.position.set(-3, 4, 3);
  const recorteAzul = new THREE.DirectionalLight(0x3d8bff, 2.2);
  recorteAzul.position.set(4, -1, 2);
  cena.add(recorte, recorteAzul);

  /* Materiais */
  const cromo = new THREE.MeshPhysicalMaterial({ color: 0xdfe4eb, metalness: 1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
  const grafite = new THREE.MeshPhysicalMaterial({ color: 0x14171c, metalness: 0.6, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.04 });
  const borracha = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  const disco = new THREE.MeshStandardMaterial({ color: 0x3b4048, metalness: 0.9, roughness: 0.38 });
  const fundo = new THREE.MeshBasicMaterial({ color: 0x030406 });
  const pinca = new THREE.MeshPhysicalMaterial({ color: 0x1f66f0, metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 });
  const aceso = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x36cfff).multiplyScalar(2.2) });
  const cromoDuplo = cromo.clone();
  cromoDuplo.side = THREE.DoubleSide;

  const roda = new THREE.Group(); // gira
  const conjunto = new THREE.Group(); // inclina com o mouse

  /* Pneu: perfil (raio, largura) girado em volta do eixo */
  const perfilPneu = [
    [0.86, 0.3], [0.92, 0.335], [1.0, 0.345], [1.07, 0.31], [1.11, 0.25], [1.125, 0.12],
    [1.125, -0.12], [1.11, -0.25], [1.07, -0.31], [1.0, -0.345], [0.92, -0.335], [0.86, -0.3],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const pneu = new THREE.Mesh(new THREE.LatheGeometry(perfilPneu, 160), borracha);
  pneu.rotation.x = Math.PI / 2;
  roda.add(pneu);

  /* Tambor do aro e borda polida */
  const perfilAro = [[0.885, 0.22], [0.855, 0.255], [0.82, 0.235], [0.8, 0.12], [0.78, -0.26]].map(([r, y]) => new THREE.Vector2(r, y));
  const aro = new THREE.Mesh(new THREE.LatheGeometry(perfilAro, 160), cromoDuplo);
  aro.rotation.x = Math.PI / 2;
  roda.add(aro);

  const borda = new THREE.Mesh(new THREE.TorusGeometry(0.866, 0.024, 16, 180), cromo);
  borda.position.z = 0.23;
  roda.add(borda);

  /* Fundo escuro atrás dos raios, para o vão não mostrar a página */
  const vao = new THREE.Mesh(new THREE.CircleGeometry(0.81, 96), fundo);
  vao.position.z = -0.24;
  roda.add(vao);

  /* Disco de freio (gira com a roda) */
  const discoFreio = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.035, 96), disco);
  discoFreio.rotation.x = Math.PI / 2;
  discoFreio.position.z = -0.06;
  roda.add(discoFreio);

  /* Dez raios finos, face preta brilhante com borda cromada (corte diamantado) */
  const formaRaio = new THREE.Shape();
  formaRaio.moveTo(-0.036, 0.17);
  formaRaio.lineTo(0.036, 0.17);
  formaRaio.lineTo(0.026, 0.81);
  formaRaio.lineTo(-0.026, 0.81);
  formaRaio.closePath();
  const geometriaRaio = new THREE.ExtrudeGeometry(formaRaio, {
    depth: 0.07,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 1,
  });
  geometriaRaio.translate(0, 0, -0.035);
  for (let i = 0; i < 10; i++) {
    const eixo = new THREE.Group();
    eixo.rotation.z = (i / 10) * Math.PI * 2;
    const raio = new THREE.Mesh(geometriaRaio, [grafite, cromo]);
    raio.position.z = 0.13;
    raio.rotation.x = 0.16; // ponta de fora mais à frente: aro côncavo
    eixo.add(raio);
    roda.add(eixo);
  }

  /* Cubo, tampa, anel aceso e parafusos */
  const cubo = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.235, 0.1, 64), cromo);
  cubo.rotation.x = Math.PI / 2;
  cubo.position.z = 0.16;
  roda.add(cubo);

  const tampa = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 0.03, 48), grafite);
  tampa.rotation.x = Math.PI / 2;
  tampa.position.z = 0.222;
  roda.add(tampa);

  const anel = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.007, 8, 72), aceso);
  anel.position.z = 0.236;
  roda.add(anel);

  const geometriaParafuso = new THREE.CylinderGeometry(0.022, 0.022, 0.045, 6);
  for (let i = 0; i < 5; i++) {
    const angulo = (i / 5) * Math.PI * 2 + Math.PI / 5;
    const parafuso = new THREE.Mesh(geometriaParafuso, cromo);
    parafuso.rotation.x = Math.PI / 2;
    parafuso.position.set(Math.cos(angulo) * 0.148, Math.sin(angulo) * 0.148, 0.225);
    roda.add(parafuso);
  }

  /* Pinça de freio: fica parada enquanto a roda gira */
  const formaPinca = new THREE.Shape();
  formaPinca.absarc(0, 0, 0.72, 0.3, 1.05, false);
  formaPinca.absarc(0, 0, 0.52, 1.05, 0.3, true);
  const pincaFreio = new THREE.Mesh(
    new THREE.ExtrudeGeometry(formaPinca, { depth: 0.13, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.018, bevelSegments: 3, curveSegments: 24 }),
    pinca,
  );
  pincaFreio.position.z = -0.12;

  conjunto.add(roda, pincaFreio);
  conjunto.rotation.set(0.05, -0.38, 0);
  cena.add(conjunto);

  return { cena, camera, conjunto, roda };
}

/*
 * Estúdio de luz só para os reflexos do metal: softbox em cima, uma faixa
 * branca à esquerda, uma faixa azul à direita e um brilho ciano embaixo.
 */
function reflexos(THREE, renderer) {
  const estudio = new THREE.Scene();
  estudio.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x050608, side: THREE.BackSide })));

  function painel(largura, altura, cor, intensidade, x, y, z) {
    const luz = new THREE.Mesh(
      new THREE.PlaneGeometry(largura, altura),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(intensidade), side: THREE.DoubleSide }),
    );
    luz.position.set(x, y, z);
    luz.lookAt(0, 0, 0);
    estudio.add(luz);
  }

  painel(14, 4, 0xffffff, 8, 0, 7, 3);
  painel(2.2, 10, 0xffffff, 6, -7, 0, 4);
  painel(2.2, 10, 0x2f7bff, 12, 7, 0, 3);
  painel(8, 1.5, 0x36cfff, 3, 0, -6, 4);
  painel(6, 6, 0xffffff, 2.2, -3, 2, 8);
  painel(3, 3, 0xffffff, 1.2, 4, 3, 8);

  const gerador = new THREE.PMREMGenerator(renderer);
  const textura = gerador.fromScene(estudio, 0.03).texture;
  gerador.dispose();
  return textura;
}
