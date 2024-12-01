import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';

function Dashboard() {
  // Form state
  const [height, setHeight] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');

  // Texture state
  const [shirtTextureParams, setShirtTextureParams] = useState({
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0
  });
  const [pantsTextureParams, setPantsTextureParams] = useState({
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0
  });
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Refs
  const containerRef = useRef(null);
  const sceneRef = useRef(new THREE.Scene());
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const loadedModelRef = useRef(null);
  const shirtMaterialRef = useRef(null);
  const pantsMaterialRef = useRef(null);
  const shirtTextureRef = useRef(null);
  const pantsTextureRef = useRef(null);
  const animationFrameRef = useRef(null);

  const navigate = useNavigate();

  // Constants
  const shirtMeshNames = ['Ribbing', 'Body_Front', 'Sleeves', 'Body_Back'];
  const pantsMeshNames = ['Pattern2D_299796'];

  const createDebugTexture = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    
    const gridSize = 8;
    const cellSize = canvas.width / gridSize;
    
    for(let i = 0; i < gridSize; i++) {
      for(let j = 0; j < gridSize; j++) {
        ctx.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#888';
        ctx.fillRect(i * cellSize, j * cellSize, cellSize, cellSize);
        ctx.fillStyle = '#000';
        ctx.font = '20px Arial';
        ctx.fillText(`${i},${j}`, i * cellSize + 10, j * cellSize + 30);
      }
    }
    
    return new THREE.CanvasTexture(canvas);
  }, []);

  const updateMaterials = useCallback((object) => {
    if (!object) return;

    const shirtMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.5,
      skinning: true,
      map: null
    });

    const pantsMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.5,
      skinning: true,
      map: null
    });
    
    shirtMaterialRef.current = shirtMaterial;
    pantsMaterialRef.current = pantsMaterial;

    object.traverse((child) => {
      if (child.isMesh) {
        child.frustumCulled = false;
        
        if (shirtMeshNames.includes(child.name)) {
          child.material = shirtMaterial;
          if (child.skeleton) {
            child.material.skinning = true;
          }
        }
        if (pantsMeshNames.includes(child.name)) {
          child.material = pantsMaterial;
          if (child.skeleton) {
            child.material.skinning = true;
          }
        }
        
        // Log UV information for debugging
        if (child.geometry && child.geometry.attributes.uv) {
          console.log(`UV info for ${child.name}:`, {
            count: child.geometry.attributes.uv.count,
            itemSize: child.geometry.attributes.uv.itemSize
          });
        }
      }
    });
  }, []);

  const toggleDebugMode = useCallback(() => {
    if (!loadedModelRef.current) return;
    
    setIsDebugMode(prev => {
      const newMode = !prev;
      loadedModelRef.current.traverse((child) => {
        if (child.isMesh) {
          if (newMode) {
            child.material = new THREE.MeshBasicMaterial({
              map: createDebugTexture(),
              side: THREE.DoubleSide
            });
          } else {
            updateMaterials(loadedModelRef.current);
          }
        }
      });
      return newMode;
    });
  }, [createDebugTexture, updateMaterials]);

  const updateTextureTransform = useCallback((materialType) => {
    const texture = materialType === 'shirt' ? shirtTextureRef.current : pantsTextureRef.current;
    const params = materialType === 'shirt' ? shirtTextureParams : pantsTextureParams;
    
    if (!texture) return;

    texture.repeat.set(params.scaleX, -params.scaleY);
    texture.offset.set(params.offsetX, 1 + params.offsetY);
    texture.rotation = (params.rotation * Math.PI) / 180;
    texture.center.set(0.5, 0.5);
    texture.needsUpdate = true;

    const material = materialType === 'shirt' ? shirtMaterialRef.current : pantsMaterialRef.current;
    if (material) {
      material.needsUpdate = true;
    }
  }, [shirtTextureParams, pantsTextureParams]);

  const handleTextureParamChange = (materialType, param, value) => {
    const setParams = materialType === 'shirt' ? setShirtTextureParams : setPantsTextureParams;
    setParams(prev => {
      const newParams = { ...prev, [param]: value };
      return newParams;
    });
    setTimeout(() => updateTextureTransform(materialType), 0);
  };

  const handleTextureUpload = (file, type) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      if (!e.target?.result) return;

      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(e.target.result.toString(), (loadedTexture) => {
        loadedTexture.colorSpace = THREE.SRGBColorSpace;
        loadedTexture.wrapS = THREE.RepeatWrapping;
        loadedTexture.wrapT = THREE.RepeatWrapping;
        loadedTexture.flipY = true;
        loadedTexture.center.set(0.5, 0.5);

        if (type === 'shirt') {
          shirtTextureRef.current = loadedTexture;
          if (shirtMaterialRef.current) {
            shirtMaterialRef.current.map = loadedTexture;
            shirtMaterialRef.current.needsUpdate = true;
          }
        } else {
          pantsTextureRef.current = loadedTexture;
          if (pantsMaterialRef.current) {
            pantsMaterialRef.current.map = loadedTexture;
            pantsMaterialRef.current.needsUpdate = true;
          }
        }
        updateTextureTransform(type);
      });
    };
    reader.readAsDataURL(file);
  };

  const flipTexture = (materialType, axis) => {
    const setParams = materialType === 'shirt' ? setShirtTextureParams : setPantsTextureParams;
    const params = materialType === 'shirt' ? shirtTextureParams : pantsTextureParams;
    setParams({
      ...params,
      [`scale${axis.toUpperCase()}`]: -params[`scale${axis.toUpperCase()}`]
    });
    setTimeout(() => updateTextureTransform(materialType), 0);
  };

  const resetTransform = (materialType) => {
    const setParams = materialType === 'shirt' ? setShirtTextureParams : setPantsTextureParams;
    setParams({
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
      rotation: 0
    });
    setTimeout(() => updateTextureTransform(materialType), 0);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const scene = sceneRef.current;
    scene.background = new THREE.Color(0x333333);

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 2, 8);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(2, 2, 5);
    directionalLight.castShadow = true;
    scene.add(ambientLight, directionalLight);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 3;
    controls.maxDistance = 15;
    controls.target.set(0, 1.5, 0);
    controlsRef.current = controls;

    // Load model
    const loader = new FBXLoader();
    loader.load(
      '/models/Tshirt+and+Jeans.fbx',
      (object) => {
        console.log('Model loaded successfully:', object);
        loadedModelRef.current = object;
        
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = (2 / maxDim) * 5;
        
        object.scale.multiplyScalar(scale);
        object.position.sub(center.multiplyScalar(scale));

        updateMaterials(object);
        scene.add(object);
        setLoadingProgress(100);
      },
      (xhr) => {
        const progress = (xhr.loaded / xhr.total * 100);
        setLoadingProgress(progress);
        console.log(`${progress}% loaded`);
      },
      (error) => {
        console.error('Error loading model:', error);
        setLoadingProgress(-1);
      }
    );

    // Animation
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [updateMaterials]);

  // const handleSubmit = async (e) => {
  //   e.preventDefault();
  //   const token = localStorage.getItem('token');
  //   const data = { height, chest, waist, hips };

  //   try {
  //     const response = await fetch('http://localhost:5001/api/measurements', {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //         Authorization: `Bearer ${token}`,
  //       },
  //       body: JSON.stringify(data),
  //     });

  //     if (response.ok) {
  //       navigate('/arview');
  //     } else {
  //       console.error('Error saving measurements.');
  //     }
  //   } catch (error) {
  //     console.error('Server error.');
  //   }
  // };
  const handleSubmit = async (e) => {
    e.preventDefault();
  
    const exporter = new GLTFExporter();
  
    if (loadedModelRef.current) {
      // Ensure textures are applied before exporting
      loadedModelRef.current.traverse((child) => {
        if (child.isMesh && child.material.map) {
          console.log(`Mesh ${child.name} has texture applied:`, child.material.map);
        } else if (child.isMesh) {
          console.error(`Mesh ${child.name} does not have a texture applied.`);
        }
      });
  
      // Export the textured model
      exporter.parse(
        loadedModelRef.current, // The 3D model to export
        async (gltf) => {
          try {
            const gltfData = JSON.stringify(gltf); // Convert GLTF data to JSON
  
            const payload = {
              height,
              chest,
              waist,
              hips,
              model: gltfData, // Include the serialized 3D model
            };
  
            const token = localStorage.getItem('token');
  
            // Send the textured model to the backend
            const response = await fetch('http://localhost:5001/api/measurements', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify(payload),
            });
  
            if (response.ok) {
              console.log('Model and measurements saved successfully.');
              navigate('/arview'); // Navigate to AR view page
            } else {
              console.error('Error saving the model and measurements.');
            }
          } catch (error) {
            console.error('Error exporting the model:', error);
          }
        },
        { binary: false } // Export as JSON (set true for binary GLB)
      );
    } else {
      console.error('No model loaded to export.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <div className="h-[100vh] relative" 
      ref={containerRef}
      style={{
        height: '80vh', // Adjust this value for the desired height
        width: '100%', // Ensure full width for the model
      }}>
        {loadingProgress !== 100 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="text-white text-xl">
              {loadingProgress === -1 ? 'Error loading model' : `Loading: ${loadingProgress.toFixed(1)}%`}
            </div>
          </div>
        )}
        <button 
          onClick={toggleDebugMode}
          className="absolute top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded"
        >
          Toggle UV Debug
        </button>
      </div>

      <div className="p-8 bg-gray-100">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Texture Controls */}
          <div className="space-y-6">
            {/* Shirt Controls */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl mb-4">T-Shirt Texture Controls</h3>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleTextureUpload(e.target.files?.[0], 'shirt')}
                className="mb-4"
              />
              <div className="space-y-4">
                {Object.entries(shirtTextureParams).map(([param, value]) => (
                  <div key={param} className="flex items-center gap-4">
                    <label className="w-24">{param}:</label>
                    <input
                      type="range"
                      min={param.includes('scale') ? 0.1 : param.includes('offset') ? -1 : 0}
                      max={param.includes('scale') ? 5 : param.includes('offset') ? 1 : 360}
                      step={param.includes('rotation') ? 90 : 0.1}
                      value={value}
                      onChange={(e) => handleTextureParamChange('shirt', param, parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-16 text-right">{value.toFixed(1)}</span>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button 
                    onClick={() => flipTexture('shirt', 'x')} 
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    Flip X
                  </button>
                  <button 
                    onClick={() => flipTexture('shirt', 'y')} 
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    Flip Y
                  </button>
                  <button 
                    onClick={() => resetTransform('shirt')} 
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>

            {/* Pants Controls */}
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl mb-4">Pants Texture Controls</h3>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleTextureUpload(e.target.files?.[0], 'pants')}
                className="mb-4"
              />
              <div className="space-y-4">
                {Object.entries(pantsTextureParams).map(([param, value]) => (
                  <div key={param} className="flex items-center gap-4">
                    <label className="w-24">{param}:</label>
                    <input
                      type="range"
                      min={param.includes('scale') ? 0.1 : param.includes('offset') ? -1 : 0}
                      max={param.includes('scale') ? 5 : param.includes('offset') ? 1 : 360}
                      step={param.includes('rotation') ? 90 : 0.1}
                      value={value}
                      onChange={(e) => handleTextureParamChange('pants', param, parseFloat(e.target.value))}
                      className="flex-1"
                    />
                    <span className="w-16 text-right">{value.toFixed(1)}</span>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button 
                    onClick={() => flipTexture('pants', 'x')} 
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    Flip X
                  </button>
                  <button 
                    onClick={() => flipTexture('pants', 'y')} 
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    Flip Y
                  </button>
                  <button 
                    onClick={() => resetTransform('pants')} 
                    className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Measurements Form */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-xl mb-6">Enter Your Measurements</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block mb-2">Height (cm):</label>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  required
                  className="w-full p-2 border rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block mb-2">Chest (cm):</label>
                <input
                  type="number"
                  value={chest}
                  onChange={(e) => setChest(e.target.value)}
                  required
                  className="w-full p-2 border rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block mb-2">Waist (cm):</label>
                <input
                  type="number"
                  value={waist}
                  onChange={(e) => setWaist(e.target.value)}
                  required
                  className="w-full p-2 border rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block mb-2">Hips (cm):</label>
                <input
                  type="number"
                  value={hips}
                  onChange={(e) => setHips(e.target.value)}
                  required
                  className="w-full p-2 border rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-blue-500 text-white py-3 px-4 rounded hover:bg-blue-600 transition-colors"
              >
                Create My AR
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;