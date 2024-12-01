import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Camera } from '@mediapipe/camera_utils';
import { Holistic } from '@mediapipe/holistic';

function ARViewer() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let camera, scene, renderer;
    let model;
    let mediaCamera;

    const initThreeJS = () => {
      // Scene setup
      scene = new THREE.Scene();

      // Camera setup
      camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      camera.position.z = 5;

      // Renderer setup
      renderer = new THREE.WebGLRenderer({ alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      containerRef.current.appendChild(renderer.domElement);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(0, 1, 2);
      scene.add(directionalLight);
    };

    const loadModel = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:5001/api/measurements', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error('Failed to fetch model data');
        }

        const data = await response.json();
        const modelPath = `http://localhost:5001${data.gltfFile}`;

        // Load the model
        const loader = new GLTFLoader();
        loader.load(
          modelPath,
          (gltf) => {
            model = gltf.scene;
            model.scale.set(0.5, 0.5, 0.5);
            scene.add(model);
            setLoading(false);
          },
          (xhr) => {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
          },
          (error) => {
            console.error('Error loading model:', error);
            setError('Failed to load model');
          }
        );
      } catch (error) {
        console.error('Error:', error);
        setError(error.message);
      }
    };

    const setupMediaPipe = () => {
      const holistic = new Holistic({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`;
        }
      });

      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: true,
        smoothSegmentation: true,
        refineFaceLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      holistic.onResults((results) => {
        if (results.poseLandmarks && model) {
          // Update model position based on pose
          const nose = results.poseLandmarks[0];
          if (nose) {
            model.position.x = (nose.x - 0.5) * 5;
            model.position.y = (0.5 - nose.y) * 5;
            model.position.z = -nose.z * 5;
          }
        }
      });

      // Setup camera
      mediaCamera = new Camera(videoRef.current, {
        onFrame: async () => {
          await holistic.send({
            image: videoRef.current
          });
        },
        width: 1280,
        height: 720
      });
      mediaCamera.start();
    };

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };

    // Initialize everything
    initThreeJS();
    loadModel();
    setupMediaPipe();
    animate();

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (mediaCamera) {
        mediaCamera.stop();
      }
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative h-screen w-screen">
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
        }}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="text-white text-xl">Loading AR Experience...</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="text-red-500 text-xl bg-white p-4 rounded-lg">
            Error: {error}
          </div>
        </div>
      )}
    </div>
  );
}

export default ARViewer;
