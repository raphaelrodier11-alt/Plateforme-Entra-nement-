/**
 * Cœur 3D du compte à rebours : un cœur modelé procéduralement (muscle, graisse,
 * artères coronaires, reflets humides) avec ses vaisseaux (aorte,
 * artère pulmonaire, veines caves, veines pulmonaires) où circulent des globules.
 * Taille, rythme, force du battement et vitesse du sang suivent `etatCoeur`.
 * Il se fait tourner du doigt. Sans WebGL, un cœur dessiné animé le remplace.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { battement, type EtatCoeur } from '../../shared/coeur';
import { animationsActives } from '../lib/animations';

interface Vaisseau {
  courbe: THREE.CatmullRomCurve3;
  rayon: number;
  couleur: number;
  /** Le sang part du cœur (artère) ou y arrive (veine). */
  sortant: boolean;
  glob: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const VAISSEAUX: Vaisseau[] = [
  // Aorte : sort du ventricule gauche, fait sa crosse et redescend.
  { courbe: new THREE.CatmullRomCurve3([V(0.45, 0.5, 0), V(0.5, 1.5, 0), V(0.35, 2.25, 0), V(-0.25, 2.55, -0.1), V(-0.75, 2.2, -0.2), V(-0.85, 1.2, -0.25)]), rayon: 0.2, couleur: 0xd8383f, sortant: true, glob: 14 },
  // Tronc de l'artère pulmonaire : sort du ventricule droit, sang pauvre en oxygène.
  { courbe: new THREE.CatmullRomCurve3([V(-0.35, 0.55, 0.45), V(-0.3, 1.45, 0.6), V(-0.9, 2.0, 0.55), V(-1.7, 2.1, 0.4)]), rayon: 0.17, couleur: 0x4962d6, sortant: true, glob: 10 },
  // Veine cave supérieure et inférieure : arrivent dans l'oreillette droite.
  { courbe: new THREE.CatmullRomCurve3([V(-1.0, 3.0, 0.1), V(-0.95, 2.0, 0.1), V(-0.8, 1.15, 0.12)]), rayon: 0.17, couleur: 0x3a4fb8, sortant: false, glob: 10 },
  { courbe: new THREE.CatmullRomCurve3([V(-1.05, -2.3, 0.1), V(-0.95, -1.0, 0.1), V(-0.75, 0.3, 0.12)]), rayon: 0.17, couleur: 0x3a4fb8, sortant: false, glob: 10 },
  // Veines pulmonaires : ramènent le sang oxygéné dans l'oreillette gauche.
  { courbe: new THREE.CatmullRomCurve3([V(2.1, 1.9, -0.2), V(1.4, 1.35, -0.2), V(0.85, 1.0, -0.2)]), rayon: 0.13, couleur: 0xe0555f, sortant: false, glob: 6 },
  { courbe: new THREE.CatmullRomCurve3([V(2.0, 0.4, -0.35), V(1.4, 0.7, -0.3), V(0.85, 0.85, -0.25)]), rayon: 0.13, couleur: 0xe0555f, sortant: false, glob: 6 },
];

/** Bruit pseudo-aléatoire lisse et déterministe (relief organique). */
function bruit(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 3.1 + y * 2.3) * Math.cos(y * 3.7 - z * 2.9) * 0.5 +
    Math.sin(z * 5.3 + x * 4.1) * 0.25 +
    Math.sin(x * 9 + y * 7 + z * 8) * 0.08
  );
}
const lisse = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Lobe {
  centre: [number, number, number];
  echelle: [number, number, number];
  /** Rétrécissement vers le bas (pointe des ventricules). */
  pointe?: number;
  relief: number;
}

/** Une masse musculaire déformée, colorée par sommet (muscle rouge, graisse jaune dans les sillons). */
function creerLobe(l: Lobe): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 96, 72);
  const pos = g.getAttribute('position');
  const couleurs = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const muscle = new THREE.Color();
  const graisse = new THREE.Color(0xd9b56b);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let { x, y, z } = v;
    if (l.pointe) {
      const t = Math.max(0, -y);
      const k = 1 - l.pointe * t ** 1.4;
      x = x * k + 0.3 * t ** 1.3;
      z *= k;
    }
    x *= l.echelle[0];
    y *= l.echelle[1];
    z *= l.echelle[2];
    if (z < 0) z *= 0.85;
    const r = l.relief * bruit(x * 1.5, y * 1.5, z * 1.5);
    const n = new THREE.Vector3(v.x, v.y, v.z).multiplyScalar(r);
    x += n.x + l.centre[0];
    y += n.y + l.centre[1];
    z += n.z + l.centre[2];
    pos.setXYZ(i, x, y, z);
    // Couleur : muscle plus sombre vers la pointe, graisse dans le sillon auriculo-ventriculaire et interventriculaire.
    const variation = 0.5 + 0.5 * bruit(x * 2.2, y * 2.2, z * 2.2);
    muscle.setRGB(0.32 + 0.14 * variation, 0.035 + 0.03 * variation, 0.05 + 0.03 * variation);
    const sillonAV = lisse(0.45, 0.9, 1 - Math.abs(y - 0.5) / 0.28) * (z > -0.2 ? 1 : 0.4);
    const sillonIV = lisse(0.5, 0.95, 1 - Math.abs(x - (0.15 + 0.32 * (0.4 - y) * 0.45)) / 0.4) * (z > 0 ? 1 : 0) * (y < 0.6 ? 1 : 0);
    const f = Math.min(1, (sillonAV * 0.7 + sillonIV * 0.4) * (0.55 + 0.6 * Math.max(0, bruit(x * 3.3, y * 3.3, z * 3.3) + 0.5)));
    muscle.lerp(graisse, f);
    couleurs[i * 3] = muscle.r;
    couleurs[i * 3 + 1] = muscle.g;
    couleurs[i * 3 + 2] = muscle.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
  g.computeVertexNormals();
  return g;
}

/** Fines aspérités du tissu (carte de relief générée, sans fichier). */
function texturerelief(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) {
    const a = 0.5 + Math.random() * 0.5;
    ctx.strokeStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${0.05 * a})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12 + Math.random() * 20, y + (Math.random() - 0.5) * 10);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

interface Moteur {
  mettreAJour: (e: EtatCoeur) => void;
  detruire: () => void;
}

function creerMoteur(conteneur: HTMLDivElement, initial: EtatCoeur): Moteur {
  const rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendu.setClearColor(0x000000, 0);
  rendu.toneMapping = THREE.ACESFilmicToneMapping;
  rendu.toneMappingExposure = 1.05;
  conteneur.appendChild(rendu.domElement);
  rendu.domElement.style.display = 'block';
  rendu.domElement.style.touchAction = 'pan-y';

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(rendu);
  const environnement = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = environnement;
  scene.environmentIntensity = 0.38;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  camera.position.set(0.3, 0.6, 12);
  const cible = new THREE.Vector3(0, 0.35, 0);
  const controles = new OrbitControls(camera, rendu.domElement);
  controles.target.copy(cible);
  controles.enableZoom = false;
  controles.enablePan = false;
  controles.enableDamping = true;
  controles.autoRotate = true;
  controles.autoRotateSpeed = 0.9;
  controles.minPolarAngle = Math.PI * 0.3;
  controles.maxPolarAngle = Math.PI * 0.7;

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const principale = new THREE.DirectionalLight(0xffffff, 1.1);
  principale.position.set(3, 5, 6);
  scene.add(principale);
  const lueur = new THREE.PointLight(0xff3040, 0, 14, 1.6);
  lueur.position.set(0, 0.3, 1.5);
  scene.add(lueur);

  const groupe = new THREE.Group();
  scene.add(groupe);

  // --- Le muscle cardiaque : ventricules, oreillettes et auricules, en une peau humide ---
  const relief = texturerelief();
  const chair = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.28,
    sheen: 0.15,
    sheenColor: new THREE.Color(0xff8a80),
    bumpMap: relief,
    bumpScale: 1.6,
    emissive: new THREE.Color(0x8b0f1a),
    emissiveIntensity: 0.05,
  });
  const lobes: Lobe[] = [
    { centre: [0.12, -0.35, 0], echelle: [1.5, 1.8, 1.12], pointe: 0.5, relief: 0.07 }, // ventricules
    { centre: [-0.9, 0.95, 0.12], echelle: [0.62, 0.78, 0.6], relief: 0.05 }, // oreillette droite
    { centre: [0.75, 1.05, -0.45], echelle: [0.62, 0.5, 0.56], relief: 0.05 }, // oreillette gauche
    { centre: [0.6, 1.2, 0.62], echelle: [0.4, 0.22, 0.2], relief: 0.04 }, // auricule gauche
    { centre: [-0.28, 1.28, 0.55], echelle: [0.36, 0.2, 0.2], relief: 0.04 }, // auricule droit
  ];
  const corps: THREE.Mesh[] = [];
  for (const l of lobes) {
    const m = new THREE.Mesh(creerLobe(l), chair);
    groupe.add(m);
    corps.push(m);
  }
  groupe.updateMatrixWorld(true);

  // Artères coronaires : posées à la surface, trouvées en envoyant un rayon sur le ventricule.
  const rayon = new THREE.Raycaster();
  const surface = (x: number, y: number): THREE.Vector3 | undefined => {
    rayon.set(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
    const touche = rayon.intersectObject(corps[0]!)[0];
    return touche ? touche.point.clone().add(new THREE.Vector3(0, 0, 0.025)) : undefined;
  };
  const trace = (points: [number, number][]) => points.map(([x, y]) => surface(x, y)).filter((p): p is THREE.Vector3 => !!p);
  const coronaires: { points: THREE.Vector3[]; rayon: number }[] = [
    { points: trace([[0.05, 0.62], [0.12, 0.2], [0.22, -0.4], [0.4, -1.1], [0.55, -1.75]]), rayon: 0.042 }, // interventriculaire antérieure
    { points: trace([[-0.1, 0.6], [-0.6, 0.5], [-1.0, 0.1], [-1.1, -0.45], [-0.95, -1.0]]), rayon: 0.038 }, // coronaire droite
    { points: trace([[0.3, 0.55], [0.75, 0.35], [1.2, -0.1], [1.4, -0.8]]), rayon: 0.032 }, // circonflexe
    { points: trace([[0.16, 0.1], [0.5, -0.1], [0.85, -0.55]]), rayon: 0.022 }, // branche
    { points: trace([[0.2, -0.5], [-0.15, -0.7], [-0.45, -1.05]]), rayon: 0.022 }, // branche
  ];
  const matArtere = new THREE.MeshPhysicalMaterial({ color: 0x9d2430, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.25 });
  const geometries: THREE.BufferGeometry[] = corps.map((m) => m.geometry);
  for (const c of coronaires) {
    if (c.points.length < 3) continue;
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(c.points), 60, c.rayon, 8, false);
    groupe.add(new THREE.Mesh(g, matArtere));
    geometries.push(g);
  }

  // --- Vaisseaux et sang ---------------------------------------------------
  const materiaux: THREE.Material[] = [chair, matArtere];
  const tubes: THREE.Mesh<THREE.TubeGeometry, THREE.MeshPhysicalMaterial>[] = [];
  const globules: { maillage: THREE.Mesh; vaisseau: Vaisseau; decalage: number }[] = [];
  const geoGlobule = new THREE.SphereGeometry(0.075, 12, 10);
  geometries.push(geoGlobule);
  for (const v of VAISSEAUX) {
    const g = new THREE.TubeGeometry(v.courbe, 80, v.rayon, 16, false);
    const mat = new THREE.MeshPhysicalMaterial({ color: v.couleur, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.3, bumpMap: relief, bumpScale: 0.8, emissive: v.couleur, emissiveIntensity: 0.06 });
    const tube = new THREE.Mesh(g, mat);
    groupe.add(tube);
    tubes.push(tube);
    geometries.push(g);
    materiaux.push(mat);
    const matGlob = new THREE.MeshBasicMaterial({ color: v.sortant && v.couleur === 0xd8383f ? 0xff7a70 : v.couleur === 0xe0555f ? 0xff9a90 : 0x8fa4ff });
    materiaux.push(matGlob);
    for (let i = 0; i < v.glob; i++) {
      const m = new THREE.Mesh(geoGlobule, matGlob);
      groupe.add(m);
      globules.push({ maillage: m, vaisseau: v, decalage: i / v.glob });
    }
  }

  let etat = initial;
  const dimensionner = () => {
    const l = conteneur.clientWidth;
    const h = conteneur.clientHeight;
    if (!l || !h) return;
    rendu.setSize(l, h, false);
    rendu.domElement.style.width = `${l}px`;
    rendu.domElement.style.height = `${h}px`;
    camera.aspect = l / h;
    camera.updateProjectionMatrix();
  };
  const observateur = new ResizeObserver(dimensionner);
  observateur.observe(conteneur);
  dimensionner();

  let image = 0;
  let depart = performance.now();
  let progres = 0;
  let debutArret: number | undefined;
  const dessiner = (statique: boolean) => {
    const t = (performance.now() - depart) / 1000;
    if (etat.arret && debutArret === undefined) debutArret = t;
    if (!etat.arret) debutArret = undefined;
    const phase = statique ? 0.1 : (t * etat.bpm) / 60;
    const bat = etat.arret ? 0 : battement(phase);
    // Arrêt : quelques secondes de fibrillation (frémissement), puis le cœur est figé.
    const tremblement = etat.arret && !statique ? Math.max(0, 1 - (t - (debutArret ?? t)) / 6) * 0.02 * Math.sin(t * 45) : 0;
    const echelle = etat.echelle * (1 + etat.amplitude * bat + tremblement);
    // Le muscle pâlit à l'arrêt (cyanose), rosit doucement quand le cœur est apaisé.
    if (etat.arret) chair.color.setRGB(0.42, 0.44, 0.7);
    else if (etat.apaise) chair.color.setRGB(1.08, 1, 0.98);
    else chair.color.setRGB(1, 1, 1);
    groupe.scale.setScalar(echelle);
    // Les muscles s'illuminent au battement ; la lueur rouge éclaire les alentours.
    chair.emissiveIntensity = 0.04 + etat.eclat * 0.5 * bat;
    for (const tube of tubes) tube.material.emissiveIntensity = 0.08 + etat.eclat * 0.5 * bat;
    lueur.intensity = etat.eclat * (6 + 34 * bat) * (0.4 + 0.6 * etat.eclat);

    // Le sang accélère à chaque systole et circule d'autant plus vite que le partiel approche.
    if (!statique) progres += (0.0035 + 0.0045 * bat) * etat.vitesseSang;
    for (const g of globules) {
      const d = (progres * 1.6 + g.decalage) % 1;
      g.maillage.position.copy(g.vaisseau.courbe.getPoint(g.vaisseau.sortant ? d : 1 - d));
      g.maillage.scale.setScalar(0.85 + 0.35 * bat);
    }
    controles.autoRotateSpeed = etat.arret ? 0.25 : 0.5 + 1.8 * etat.urgence;
    controles.update();
    rendu.render(scene, camera);
  };

  const boucle = () => {
    image = requestAnimationFrame(boucle);
    dessiner(false);
  };
  const demarrer = () => {
    cancelAnimationFrame(image);
    image = 0;
    if (!animationsActives() || document.hidden) {
      dessiner(true);
      return;
    }
    depart = performance.now();
    boucle();
  };
  const surVisibilite = () => demarrer();
  document.addEventListener('visibilitychange', surVisibilite);
  window.addEventListener('dr-rodier:animations', surVisibilite);
  demarrer();

  return {
    mettreAJour: (e) => {
      etat = e;
      if (!image) dessiner(true);
    },
    detruire: () => {
      cancelAnimationFrame(image);
      document.removeEventListener('visibilitychange', surVisibilite);
      window.removeEventListener('dr-rodier:animations', surVisibilite);
      observateur.disconnect();
      for (const g of geometries) g.dispose();
      for (const m of materiaux) m.dispose();
      controles.dispose();
      relief.dispose();
      environnement.dispose();
      pmrem.dispose();
      rendu.dispose();
      rendu.domElement.remove();
    },
  };
}

/** Cœur dessiné, quand la 3D n'est pas disponible : même rythme, même grossissement. */
function CoeurSecours({ etat }: { etat: EtatCoeur }) {
  return (
    <div className="grid h-full place-items-center">
      <svg
        viewBox="0 0 100 90"
        className="w-40"
        style={{ transform: `scale(${etat.echelle})`, animation: etat.arret || etat.bpm <= 0 || !animationsActives() ? 'none' : `coeur-bat ${60 / etat.bpm}s ease-in-out infinite` }}
        role="img"
        aria-label="Cœur"
      >
        <path d="M50 85 C10 55 2 30 18 14 C32 2 46 12 50 24 C54 12 68 2 82 14 C98 30 90 55 50 85Z" fill="#c22f3b" />
      </svg>
    </div>
  );
}

export function Coeur3D({ etat, className = '' }: { etat: EtatCoeur; className?: string }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const moteur = useRef<Moteur | undefined>(undefined);
  const etatInitial = useRef(etat);
  const [secours, setSecours] = useState(false);

  useEffect(() => {
    if (!conteneur.current) return;
    try {
      moteur.current = creerMoteur(conteneur.current, etatInitial.current);
    } catch {
      setSecours(true);
    }
    return () => {
      moteur.current?.detruire();
      moteur.current = undefined;
    };
  }, []);

  useEffect(() => {
    moteur.current?.mettreAJour(etat);
  }, [etat]);

  if (secours) return <div className={className}><CoeurSecours etat={etat} /></div>;
  return <div ref={conteneur} className={className} role="img" aria-label={etat.arret ? 'Cœur à l’arrêt' : `Cœur à ${etat.bpm} battements par minute`} />;
}
