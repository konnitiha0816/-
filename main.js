import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createNoise2D } from 'simplex-noise';

// ==========================================
// 1. テクスチャのプロシージャル生成（画像ファイル不要）
// ==========================================
function createTexture(type) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d');

    if (type === 'grass_top') {
        ctx.fillStyle = '#55aa55';
        ctx.fillRect(0, 0, 16, 16);
        for(let i=0; i<40; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#449944' : '#66bb66';
            ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 1, 1);
        }
    } else if (type === 'dirt') {
        ctx.fillStyle = '#8b5a2b';
        ctx.fillRect(0, 0, 16, 16);
        for(let i=0; i<50; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#7a491a' : '#9c6b3c';
            ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 2, 2);
        }
    } else if (type === 'stone') {
        ctx.fillStyle = '#888888';
        ctx.fillRect(0, 0, 16, 16);
        for(let i=0; i<50; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#777777' : '#999999';
            ctx.fillRect(Math.floor(Math.random()*16), Math.floor(Math.random()*16), 2, 2);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

const textures = {
    grass: createTexture('grass_top'),
    dirt: createTexture('dirt'),
    stone: createTexture('stone')
};

const materials = [
    null, // 0: 空気
    [ // 1: 草ブロック (右, 左, 上, 下, 前, 後)
        new THREE.MeshLambertMaterial({ map: textures.dirt }),
        new THREE.MeshLambertMaterial({ map: textures.dirt }),
        new THREE.MeshLambertMaterial({ map: textures.grass }),
        new THREE.MeshLambertMaterial({ map: textures.dirt }),
        new THREE.MeshLambertMaterial({ map: textures.dirt }),
        new THREE.MeshLambertMaterial({ map: textures.dirt })
    ],
    new THREE.MeshLambertMaterial({ map: textures.dirt }),  // 2: 土
    new THREE.MeshLambertMaterial({ map: textures.stone })  // 3: 石
];

// ==========================================
// 2. ボクセルワールド管理クラス (Simplex Noiseによる自然な地形)
// ==========================================
class World {
    constructor(scene, chunkSize = 48) {
        this.scene = scene;
        this.chunkSize = chunkSize;
        this.data = new Uint8Array(this.chunkSize * this.chunkSize * this.chunkSize);
        this.mesh = null;
        this.generateTerrain();
        this.updateMesh();
    }

    getIndex(x, y, z) {
        return x + y * this.chunkSize + z * this.chunkSize * this.chunkSize;
    }

    getBlock(x, y, z) {
        if (x < 0 || x >= this.chunkSize || y < 0 || y >= this.chunkSize || z < 0 || z >= this.chunkSize) return 0;
        return this.data[this.getIndex(x, y, z)];
    }

    setBlock(x, y, z, type) {
        if (x < 0 || x >= this.chunkSize || y < 0 || y >= this.chunkSize || z < 0 || z >= this.chunkSize) return;
        this.data[this.getIndex(x, y, z)] = type;
        this.updateMesh();
    }

    // パーリンノイズ（Simplex Noise）を使った自然な起伏の生成（省略なし）
    generateTerrain() {
        const noise2D = createNoise2D();
        for (let x = 0; x < this.chunkSize; x++) {
            for (let z = 0; z < this.chunkSize; z++) {
                // ノイズを使ってなだらかな丘を生成 (-1 から 1 の値を高さに変換)
                const noiseValue = noise2D(x * 0.04, z * 0.04);
                const height = Math.floor((noiseValue + 1) * 6) + 10; 

                for (let y = 0; y < this.chunkSize; y++) {
                    let type = 0;
                    if (y < height - 3) {
                        type = 3; // 深い部分は石
                    } else if (y < height) {
                        type = 2; // 表面の少し下は土
                    } else if (y === height) {
                        type = 1; // 表面は草
                    }
                    this.data[this.getIndex(x, y, z)] = type;
                }
            }
        }
    }

    // 面カリングによる最適化メッシュ生成
    updateMesh() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
        }

        const directions = [
            { dir: [1, 0, 0] }, { dir: [-1, 0, 0] },
            { dir: [0, 1, 0] }, { dir: [0, -1, 0] },
            { dir: [0, 0, 1] }, { dir: [0, 0, -1] }
        ];

        const baseGeometries = {
            1: new THREE.BoxGeometry(1, 1, 1),
            2: new THREE.BoxGeometry(1, 1, 1),
            3: new THREE.BoxGeometry(1, 1, 1)
        };

        const group = new THREE.Group();

        for (let x = 0; x < this.chunkSize; x++) {
            for (let y = 0; y < this.chunkSize; y++) {
                for (let z = 0; z < this.chunkSize; z++) {
                    const blockType = this.getBlock(x, y, z);
                    if (blockType === 0) continue;

                    let exposed = false;
                    for (const { dir } of directions) {
                        if (this.getBlock(x + dir[0], y + dir[1], z + dir[2]) === 0) {
                            exposed = true;
                            break;
                        }
                    }

                    if (exposed) {
                        const mesh = new THREE.Mesh(baseGeometries[blockType], materials[blockType]);
                        mesh.position.set(x, y, z);
                        mesh.updateMatrix();
                        group.add(mesh);
                    }
                }
            }
        }

        this.mesh = group;
        this.scene.add(this.mesh);
    }
}

// ==========================================
// 3. 物理演算・プレイヤー制御・ブロック操作クラス
// ==========================================
class Player {
    constructor(camera, world, scene) {
        this.camera = camera;
        this.world = world;
        this.controls = new PointerLockControls(camera, document.body);
        
        this.radius = 0.3;
        this.height = 1.6;
        this.position = new THREE.Vector3(24, 30, 24); // 落下を防ぐため初期位置を高めに設定
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.direction = new THREE.Vector3();
        
        this.speed = 4.5;
        this.jumpForce = 7.5;
        this.gravity = 20.0;
        this.onGround = false;
        
        this.moveState = { forward: false, backward: false, left: false, right: false };

        this.camera.position.copy(this.position);
        this.setupInputs();

        this.selectedBlockType = 1;
        this.setupUI();

        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 6; 
        this.interactionBox = new THREE.Mesh(
            new THREE.BoxGeometry(1.02, 1.02, 1.02),
            new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.6 })
        );
        scene.add(this.interactionBox);
    }

    setupInputs() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        const menu = document.getElementById('menu');
        document.addEventListener('click', (e) => {
            if (!this.controls.isLocked && e.target.id !== 'menu') {
                this.controls.lock();
            }
        });

        this.controls.addEventListener('lock', () => {
            menu.style.opacity = '0';
            menu.style.pointerEvents = 'none';
        });

        this.controls.addEventListener('unlock', () => {
            menu.style.opacity = '1';
            menu.style.pointerEvents = 'auto';
        });

        document.addEventListener('mousedown', (e) => {
            if (!this.controls.isLocked) return;
            if (e.button === 0) this.interactBlock(false); // 左クリックで破壊
            if (e.button === 2) this.interactBlock(true);  // 右クリックで設置
        });
    }

    setupUI() {
        document.addEventListener('keydown', (e) => {
            if (['1', '2', '3'].includes(e.key)) {
                this.selectedBlockType = parseInt(e.key);
                document.querySelectorAll('.slot').forEach(el => el.classList.remove('active'));
                document.getElementById(`slot-${e.key}`).classList.add('active');
            }
        });
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW': this.moveState.forward = true; break;
            case 'KeyS': this.moveState.backward = true; break;
            case 'KeyA': this.moveState.left = true; break;
            case 'KeyD': this.moveState.right = true; break;
            case 'Space': 
                if (this.onGround) this.velocity.y = this.jumpForce;
                break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW': this.moveState.forward = false; break;
            case 'KeyS': this.moveState.backward = false; break;
            case 'KeyA': this.moveState.left = false; break;
            case 'KeyD': this.moveState.right = false; break;
        }
    }

    checkCollision(pos) {
        const minX = Math.floor(pos.x - this.radius);
        const maxX = Math.floor(pos.x + this.radius);
        const minY = Math.floor(pos.y - this.height);
        const maxY = Math.floor(pos.y);
        const minZ = Math.floor(pos.z - this.radius);
        const maxZ = Math.floor(pos.z + this.radius);

        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                for (let z = minZ; z <= maxZ; z++) {
                    if (this.world.getBlock(x, y, z) !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    updatePhysics(delta) {
        this.direction.z = Number(this.moveState.forward) - Number(this.moveState.backward);
        this.direction.x = Number(this.moveState.right) - Number(this.moveState.left);
        this.direction.normalize();

        const euler = new THREE.Euler(0, this.camera.rotation.y, 0, 'YXZ');
        const moveVec = this.direction.clone().applyEuler(euler).multiplyScalar(this.speed * delta);

        this.position.x += moveVec.x;
        if (this.checkCollision(this.position)) this.position.x -= moveVec.x;

        this.position.z += moveVec.z;
        if (this.checkCollision(this.position)) this.position.z -= moveVec.z;

        this.velocity.y -= this.gravity * delta;
        this.position.y += this.velocity.y * delta;
        
        this.onGround = false;
        if (this.checkCollision(this.position)) {
            if (this.velocity.y < 0) {
                this.position.y = Math.floor(this.position.y) + this.height + 0.001;
                this.onGround = true;
            } else if (this.velocity.y > 0) {
                this.position.y = Math.ceil(this.position.y - this.height) - 0.001 + this.height;
            }
            this.velocity.y = 0;
        }

        this.camera.position.copy(this.position);
    }

    updateRaycast() {
        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        
        const step = 0.05;
        let hit = null;
        let prevPos = null;

        const rayDir = this.raycaster.ray.direction.clone().normalize();
        let currentPos = this.raycaster.ray.origin.clone();

        for (let i = 0; i < this.raycaster.far; i += step) {
            currentPos.add(rayDir.clone().multiplyScalar(step));
            const bx = Math.floor(currentPos.x);
            const by = Math.floor(currentPos.y);
            const bz = Math.floor(currentPos.z);

            if (this.world.getBlock(bx, by, bz) !== 0) {
                hit = { x: bx, y: by, z: bz };
                break;
            }
            prevPos = { x: bx, y: by, z: bz };
        }

        if (hit) {
            this.interactionBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
            this.interactionBox.visible = true;
            this.currentHit = hit;
            this.currentPrev = prevPos;
        } else {
            this.interactionBox.visible = false;
            this.currentHit = null;
            this.currentPrev = null;
        }
    }

    interactBlock(isPlacing) {
        if (!this.currentHit) return;

        if (isPlacing && this.currentPrev) {
            const blockCenter = new THREE.Vector3(this.currentPrev.x + 0.5, this.currentPrev.y + 0.5, this.currentPrev.z + 0.5);
            const playerCenter = this.position.clone();
            playerCenter.y -= this.height / 2;
            
            if (blockCenter.distanceTo(playerCenter) > 1.2) {
                this.world.setBlock(this.currentPrev.x, this.currentPrev.y, this.currentPrev.z, this.selectedBlockType);
            }
        } else if (!isPlacing) {
            this.world.setBlock(this.currentHit.x, this.currentHit.y, this.currentHit.z, 0);
        }
    }

    update(delta) {
        if (!this.controls.isLocked) return;
        this.updatePhysics(delta);
        this.updateRaycast();
    }
}

// ==========================================
// 4. メインループと初期化処理
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); 
scene.fog = new THREE.Fog(0x87CEEB, 15, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);

const world = new World(scene, 48); // チャンクサイズを48に拡大し、より広い世界に
const player = new Player(camera, world, scene);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(clock.getDelta(), 0.1); 
    player.update(delta);
    renderer.render(scene, camera);
}

animate();
