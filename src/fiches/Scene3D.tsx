/**
 * Visualiseur 3D interactif.
 *
 * Une scène est une description déclarative : des objets simples (sphère,
 * boîte, cylindre, cône, tore, tube) et des étapes qui mettent certains
 * objets en évidence, en masquent d'autres et animent un flux le long d'un
 * tube. Le modèle se manipule au doigt ou à la souris ; les étapes se
 * parcourent une à une ou en lecture automatique.
 */
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Objet3D, Scene3D } from '../../shared/types';
import { Bouton, cx } from '../composants/ui';

const CAMERA_DEFAUT: [number, number, number] = [0, 2.5, 8];
const DUREE_ETAPE_MS = 4500;
const PARTICULES_PAR_FLUX = 7;

function creerGeometrie(o: Objet3D): { geometrie: THREE.BufferGeometry; courbe?: THREE.CatmullRomCurve3 } {
  const [x = 1, y = 1, z = 1] = o.taille ?? [];
  switch (o.forme) {
    case 'sphere':
      return { geometrie: new THREE.SphereGeometry(x, 40, 28) };
    case 'boite':
      return { geometrie: new THREE.BoxGeometry(x, y, z) };
    case 'cylindre':
      return { geometrie: new THREE.CylinderGeometry(x, x, y, 40) };
    case 'cone':
      return { geometrie: new THREE.ConeGeometry(x, y, 40) };
    case 'tore':
      return { geometrie: new THREE.TorusGeometry(x, o.taille?.[1] ?? 0.12, 20, 60) };
    case 'tube': {
      const points = (o.chemin ?? []).map((p) => new THREE.Vector3(...p));
      const courbe = new THREE.CatmullRomCurve3(
        points.length >= 2 ? points : [new THREE.Vector3(), new THREE.Vector3(0, 1, 0)],
      );
      return { geometrie: new THREE.TubeGeometry(courbe, 96, o.taille?.[0] ?? 0.1, 14), courbe };
    }
  }
}

interface ObjetScene {
  definition: Objet3D;
  maillage: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  courbe?: THREE.CatmullRomCurve3;
  /** Point où ancrer l'étiquette. */
  ancre: THREE.Vector3;
}

interface Moteur {
  appliquerEtape: (indice: number) => void;
  reinitialiserVue: () => void;
  detruire: () => void;
}

function creerMoteur(
  conteneur: HTMLDivElement,
  calque: HTMLDivElement,
  scene3d: Scene3D,
  onSelection: (id: string | undefined) => void,
): Moteur {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(...CAMERA_DEFAUT);

  const rendu = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  rendu.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  conteneur.appendChild(rendu.domElement);
  rendu.domElement.style.display = 'block';
  rendu.domElement.style.touchAction = 'none';

  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const soleil = new THREE.DirectionalLight(0xffffff, 2.2);
  soleil.position.set(4, 8, 6);
  scene.add(soleil);
  const contre = new THREE.DirectionalLight(0x86b6ef, 0.8);
  contre.position.set(-6, -2, -4);
  scene.add(contre);

  const controles = new OrbitControls(camera, rendu.domElement);
  controles.enableDamping = true;
  controles.enablePan = false;
  controles.minDistance = 2;
  controles.maxDistance = 30;

  const objets = new Map<string, ObjetScene>();
  const etiquettes = new Map<string, HTMLSpanElement>();
  for (const definition of scene3d.objets) {
    const { geometrie, courbe } = creerGeometrie(definition);
    const materiau = new THREE.MeshStandardMaterial({
      color: definition.couleur,
      transparent: true,
      opacity: definition.opacite ?? 1,
      roughness: 0.55,
      metalness: 0.05,
    });
    const maillage = new THREE.Mesh(geometrie, materiau);
    if (definition.forme !== 'tube') {
      maillage.position.set(...(definition.position ?? [0, 0, 0]));
      if (definition.rotation) maillage.rotation.set(...definition.rotation);
    }
    maillage.userData.id = definition.id;
    scene.add(maillage);
    const ancre = courbe ? courbe.getPoint(0.5) : maillage.position.clone();
    objets.set(definition.id, { definition, maillage, courbe, ancre });

    if (definition.label) {
      const etiquette = document.createElement('span');
      etiquette.textContent = definition.label;
      etiquette.className =
        'pointer-events-none absolute left-0 top-0 rounded-md bg-fond/80 px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-texte';
      calque.appendChild(etiquette);
      etiquettes.set(definition.id, etiquette);
    }
  }

  // Particules animées le long des tubes (flux sanguin, filtrat, influx…).
  const geometrieParticule = new THREE.SphereGeometry(0.07, 12, 10);
  let particules: { maillage: THREE.Mesh; courbe: THREE.CatmullRomCurve3; decalage: number }[] = [];
  const viderParticules = () => {
    for (const p of particules) {
      scene.remove(p.maillage);
      (p.maillage.material as THREE.Material).dispose();
    }
    particules = [];
  };

  let cibleCamera: THREE.Vector3 | undefined;
  let focus: Set<string> | undefined;

  const appliquerEtape = (indice: number) => {
    const etape = scene3d.etapes[indice];
    focus = etape?.focus?.length ? new Set(etape.focus) : undefined;
    const masques = new Set(etape?.masques ?? []);
    for (const [id, o] of objets) {
      const base = o.definition.opacite ?? 1;
      o.maillage.visible = !masques.has(id);
      o.maillage.material.opacity = focus && !focus.has(id) ? Math.min(base, 0.14) : base;
      o.maillage.material.depthWrite = !(focus && !focus.has(id));
      o.maillage.material.emissive.set(focus?.has(id) ? o.definition.couleur : '#000000');
      o.maillage.material.emissiveIntensity = focus?.has(id) ? 0.25 : 0;
    }
    viderParticules();
    for (const flux of etape?.flux ?? []) {
      const tube = objets.get(flux.tube);
      if (!tube?.courbe || masques.has(flux.tube)) continue;
      for (let i = 0; i < PARTICULES_PAR_FLUX; i++) {
        const maillage = new THREE.Mesh(
          geometrieParticule,
          new THREE.MeshBasicMaterial({ color: flux.couleur ?? '#f0efec' }),
        );
        scene.add(maillage);
        particules.push({ maillage, courbe: tube.courbe, decalage: i / PARTICULES_PAR_FLUX });
      }
    }
    cibleCamera = new THREE.Vector3(...(etape?.camera ?? CAMERA_DEFAUT));
  };

  const reinitialiserVue = () => {
    cibleCamera = new THREE.Vector3(...CAMERA_DEFAUT);
    controles.target.set(0, 0, 0);
  };

  // Sélection d'un objet au clic (sans confondre avec une rotation).
  const rayon = new THREE.Raycaster();
  let appui: { x: number; y: number } | undefined;
  const auAppui = (e: PointerEvent) => {
    appui = { x: e.clientX, y: e.clientY };
    cibleCamera = undefined; // l'utilisateur reprend la main sur la caméra
  };
  const auRelachement = (e: PointerEvent) => {
    if (!appui || Math.hypot(e.clientX - appui.x, e.clientY - appui.y) > 6) return;
    const boite = rendu.domElement.getBoundingClientRect();
    const point = new THREE.Vector2(
      ((e.clientX - boite.left) / boite.width) * 2 - 1,
      -((e.clientY - boite.top) / boite.height) * 2 + 1,
    );
    rayon.setFromCamera(point, camera);
    const touche = rayon
      .intersectObjects([...objets.values()].map((o) => o.maillage).filter((m) => m.visible))
      .find((t) => (t.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.opacity > 0.2);
    onSelection(touche ? (touche.object.userData.id as string) : undefined);
  };
  rendu.domElement.addEventListener('pointerdown', auAppui);
  rendu.domElement.addEventListener('pointerup', auRelachement);

  const dimensionner = () => {
    const largeur = conteneur.clientWidth;
    const hauteur = conteneur.clientHeight;
    if (!largeur || !hauteur) return;
    rendu.setSize(largeur, hauteur, false);
    rendu.domElement.style.width = `${largeur}px`;
    rendu.domElement.style.height = `${hauteur}px`;
    camera.aspect = largeur / hauteur;
    camera.updateProjectionMatrix();
  };
  const observateur = new ResizeObserver(dimensionner);
  observateur.observe(conteneur);
  dimensionner();

  const horloge = new THREE.Clock();
  const projete = new THREE.Vector3();
  let image = 0;
  const boucle = () => {
    image = requestAnimationFrame(boucle);
    const temps = horloge.getElapsedTime();
    if (cibleCamera) {
      camera.position.lerp(cibleCamera, 0.06);
      if (camera.position.distanceTo(cibleCamera) < 0.02) cibleCamera = undefined;
    }
    for (const p of particules) {
      p.maillage.position.copy(p.courbe.getPoint((temps * 0.18 + p.decalage) % 1));
    }
    controles.update();
    rendu.render(scene, camera);

    const largeur = conteneur.clientWidth;
    const hauteur = conteneur.clientHeight;
    for (const [id, etiquette] of etiquettes) {
      const o = objets.get(id)!;
      projete.copy(o.ancre).project(camera);
      const visible = o.maillage.visible && projete.z < 1 && (!focus || focus.has(id));
      etiquette.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      const x = (projete.x * 0.5 + 0.5) * largeur;
      const y = (-projete.y * 0.5 + 0.5) * hauteur;
      etiquette.style.transform = `translate(-50%, -140%) translate(${x}px, ${y}px)`;
    }
  };
  boucle();

  return {
    appliquerEtape,
    reinitialiserVue,
    detruire: () => {
      cancelAnimationFrame(image);
      observateur.disconnect();
      rendu.domElement.removeEventListener('pointerdown', auAppui);
      rendu.domElement.removeEventListener('pointerup', auRelachement);
      viderParticules();
      geometrieParticule.dispose();
      for (const o of objets.values()) {
        o.maillage.geometry.dispose();
        o.maillage.material.dispose();
      }
      for (const etiquette of etiquettes.values()) etiquette.remove();
      controles.dispose();
      rendu.dispose();
      rendu.domElement.remove();
    },
  };
}

export default function Scene3DVue({ scene }: { scene: Scene3D }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const calque = useRef<HTMLDivElement>(null);
  const moteur = useRef<Moteur | undefined>(undefined);
  const [etape, setEtape] = useState(0);
  const [lecture, setLecture] = useState(false);
  const [selection, setSelection] = useState<string>();
  const [indisponible, setIndisponible] = useState(false);

  useEffect(() => {
    if (!conteneur.current || !calque.current) return;
    try {
      moteur.current = creerMoteur(conteneur.current, calque.current, scene, setSelection);
      moteur.current.appliquerEtape(0);
    } catch {
      // Pas de WebGL sur cet appareil : les étapes restent lisibles en texte.
      setIndisponible(true);
    }
    return () => {
      moteur.current?.detruire();
      moteur.current = undefined;
    };
  }, [scene]);

  useEffect(() => {
    moteur.current?.appliquerEtape(etape);
  }, [etape]);

  useEffect(() => {
    if (!lecture) return;
    const id = setTimeout(() => {
      if (etape + 1 < scene.etapes.length) setEtape(etape + 1);
      else setLecture(false);
    }, DUREE_ETAPE_MS);
    return () => clearTimeout(id);
  }, [lecture, etape, scene.etapes.length]);

  const courante = scene.etapes[etape];
  const objetChoisi = scene.objets.find((o) => o.id === selection);

  return (
    <div>
      {scene.description && <p className="mb-3 text-sm text-texte-2">{scene.description}</p>}
      {indisponible ? (
        <p className="rounded-xl bg-surface p-3 text-sm text-texte-2">
          L'affichage 3D n'est pas disponible sur cet appareil. Les étapes restent lisibles
          ci-dessous.
        </p>
      ) : (
        <div className="relative h-72 overflow-hidden rounded-xl bg-[#101418] sm:h-96">
          <div ref={conteneur} className="absolute inset-0" aria-label={`Modèle 3D : ${scene.titre}`} role="img" />
          <div ref={calque} className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden />
          <button
            type="button"
            onClick={() => moteur.current?.reinitialiserVue()}
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-lg bg-fond/70 text-texte-2 hover:text-texte"
            aria-label="Réinitialiser la vue"
            title="Réinitialiser la vue"
          >
            <RotateCcw size={16} aria-hidden />
          </button>
        </div>
      )}

      {objetChoisi && (
        <p className="mt-2 rounded-lg bg-surface p-2.5 text-sm text-texte-2" role="status">
          <strong className="font-semibold text-texte">{objetChoisi.label ?? objetChoisi.id}</strong>
          {objetChoisi.detail ? ` — ${objetChoisi.detail}` : ''}
        </p>
      )}

      {courante && (
        <div className="mt-3">
          <ol className="mb-2 flex gap-1" aria-label="Étapes de l'animation">
            {scene.etapes.map((e, k) => (
              <li key={k} className="flex-1">
                <button
                  type="button"
                  onClick={() => {
                    setLecture(false);
                    setEtape(k);
                  }}
                  aria-current={k === etape ? 'step' : undefined}
                  aria-label={`Étape ${k + 1} : ${e.titre}`}
                  className={cx('h-1.5 w-full rounded-full', k <= etape ? 'bg-accent' : 'bg-accent/20')}
                />
              </li>
            ))}
          </ol>
          <div className="min-h-20 rounded-xl bg-surface p-3" aria-live="polite">
            <p className="chiffres text-xs text-muet">
              Étape {etape + 1} / {scene.etapes.length}
            </p>
            <p className="mt-0.5 text-sm font-semibold">{courante.titre}</p>
            <p className="mt-0.5 text-sm text-texte-2">{courante.texte}</p>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Bouton
              icone={ChevronLeft}
              disabled={etape === 0}
              onClick={() => {
                setLecture(false);
                setEtape(etape - 1);
              }}
            >
              Précédent
            </Bouton>
            <Bouton
              icone={lecture ? Pause : Play}
              onClick={() => {
                if (!lecture && etape === scene.etapes.length - 1) setEtape(0);
                setLecture(!lecture);
              }}
            >
              {lecture ? 'Pause' : 'Lecture'}
            </Bouton>
            <Bouton
              variante="primaire"
              disabled={etape === scene.etapes.length - 1}
              onClick={() => {
                setLecture(false);
                setEtape(etape + 1);
              }}
            >
              Suivant
              <ChevronRight size={18} aria-hidden />
            </Bouton>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-muet">
        Fais glisser pour tourner, pince ou utilise la molette pour zoomer, touche un élément pour
        l'identifier. Modèle schématique, non anatomique.
      </p>
    </div>
  );
}
