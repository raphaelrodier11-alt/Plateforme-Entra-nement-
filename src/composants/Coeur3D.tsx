/**
 * Cœur 3D du compte à rebours : un cœur schématique avec ses vaisseaux (aorte,
 * artère pulmonaire, veines caves, veines pulmonaires) où circulent des globules.
 * Taille, rythme, force du battement et vitesse du sang suivent `etatCoeur`.
 * Il se fait tourner du doigt. Sans WebGL, un cœur dessiné animé le remplace.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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

interface Moteur {
  mettreAJour: (e: EtatCoeur) => void;
  detruire: () => void;
}

function creerMoteur(conteneur: HTMLDivElement, initial: EtatCoeur): Moteur {
  const rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  rendu.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  rendu.setClearColor(0x000000, 0);
  conteneur.appendChild(rendu.domElement);
  rendu.domElement.style.display = 'block';
  rendu.domElement.style.touchAction = 'pan-y';

  const scene = new THREE.Scene();
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

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const principale = new THREE.DirectionalLight(0xffffff, 1.5);
  principale.position.set(3, 5, 6);
  scene.add(principale);
  const lueur = new THREE.PointLight(0xff3040, 0, 14, 1.6);
  lueur.position.set(0, 0.3, 1.5);
  scene.add(lueur);

  const groupe = new THREE.Group();
  scene.add(groupe);

  // --- Le muscle cardiaque : deux ventricules et deux oreillettes -------------
  const geo = new THREE.SphereGeometry(1, 48, 36);
  const matCoeur = (couleur: number) =>
    new THREE.MeshStandardMaterial({ color: couleur, roughness: 0.42, metalness: 0.05, emissive: couleur, emissiveIntensity: 0.05 });
  const muscles: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = [];
  const muscle = (couleur: number, p: [number, number, number], s: [number, number, number], r: [number, number, number] = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, matCoeur(couleur));
    m.position.set(...p);
    m.scale.set(...s);
    m.rotation.set(...r);
    groupe.add(m);
    muscles.push(m);
  };
  muscle(0xc22f3b, [0.42, -0.45, 0], [1.05, 1.55, 0.98], [0, 0, 0.32]); // ventricule gauche
  muscle(0x9b2c55, [-0.5, -0.25, 0.32], [0.92, 1.3, 0.9], [0, 0, -0.18]); // ventricule droit
  muscle(0xb02c3d, [0.65, 0.95, -0.25], [0.62, 0.55, 0.55]); // oreillette gauche
  muscle(0x8a2a58, [-0.78, 0.85, 0.12], [0.66, 0.62, 0.6]); // oreillette droite

  // --- Vaisseaux et sang ---------------------------------------------------
  const geometries: THREE.BufferGeometry[] = [geo];
  const materiaux: THREE.Material[] = muscles.map((m) => m.material);
  const tubes: THREE.Mesh<THREE.TubeGeometry, THREE.MeshStandardMaterial>[] = [];
  const globules: { maillage: THREE.Mesh; vaisseau: Vaisseau; decalage: number }[] = [];
  const geoGlobule = new THREE.SphereGeometry(0.075, 12, 10);
  geometries.push(geoGlobule);
  for (const v of VAISSEAUX) {
    const g = new THREE.TubeGeometry(v.courbe, 80, v.rayon, 16, false);
    const mat = new THREE.MeshStandardMaterial({ color: v.couleur, roughness: 0.4, transparent: true, opacity: 0.82, emissive: v.couleur, emissiveIntensity: 0.1 });
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
  const dessiner = (statique: boolean) => {
    const t = (performance.now() - depart) / 1000;
    const phase = statique ? 0.1 : (t * etat.bpm) / 60;
    const bat = battement(phase);
    const echelle = etat.echelle * (1 + etat.amplitude * bat);
    groupe.scale.setScalar(echelle);
    // Les muscles s'illuminent au battement ; la lueur rouge éclaire les alentours.
    for (const m of muscles) m.material.emissiveIntensity = 0.04 + etat.eclat * 0.55 * bat;
    for (const tube of tubes) tube.material.emissiveIntensity = 0.08 + etat.eclat * 0.5 * bat;
    lueur.intensity = etat.eclat * (6 + 34 * bat) * (0.4 + 0.6 * etat.eclat);

    // Le sang accélère à chaque systole et circule d'autant plus vite que le partiel approche.
    if (!statique) progres += (0.0035 + 0.0045 * bat) * etat.vitesseSang;
    for (const g of globules) {
      const d = (progres * 1.6 + g.decalage) % 1;
      g.maillage.position.copy(g.vaisseau.courbe.getPoint(g.vaisseau.sortant ? d : 1 - d));
      g.maillage.scale.setScalar(0.85 + 0.35 * bat);
    }
    controles.autoRotateSpeed = 0.5 + 1.8 * etat.urgence;
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
        style={{ transform: `scale(${etat.echelle})`, animation: `${animationsActives() ? 'coeur-bat' : 'none'} ${60 / etat.bpm}s ease-in-out infinite` }}
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
  return <div ref={conteneur} className={className} role="img" aria-label={`Cœur à ${etat.bpm} battements par minute`} />;
}
