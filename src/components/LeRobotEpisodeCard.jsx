import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Row, Col, Table, Alert, Button } from 'antd';
import ReactPlayer from 'react-player';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Points } from '@react-three/drei';
import * as THREE from 'three';
import Plot from 'react-plotly.js';
import { ErrorBoundary } from 'react-error-boundary';
import './LeRobotEpisodeCard.css';

const ErrorFallback = ({ error }) => (
    <Alert
        message="Point Cloud Rendering Error"
        description={`Failed to render point cloud: ${error.message}`}
        type="error"
        showIcon
    />
);

const PointCloud = ({ points, camera }) => {
    const meshRef = useRef();
    const colorArray = useMemo(() => {
        const colors = [];
        if (!points?.length) return new Float32Array();

        const zValues = points.map(p => p[2]);
        const minZ = Math.min(...zValues);
        const maxZ = Math.max(...zValues);
        const rangeZ = Math.max(maxZ - minZ, 1e-5);

        for (let i = 0; i < points.length; i++) {
            const normZ = (points[i][2] - minZ) / rangeZ;
            const color = new THREE.Color();
            color.setHSL(0.7 - normZ * 0.7, 1.0, 0.5);
            colors.push(color.r, color.g, color.b);
        }
        return new Float32Array(colors);
    }, [points]);

    const matrixArray = useMemo(() => {
        const matrices = [];
        const dummy = new THREE.Object3D();
        for (let i = 0; i < points.length; i++) {
            const [x, y, z] = points[i];
            dummy.position.set(x, y, z);
            dummy.scale.set(0.015, 0.015, 0.015);
            dummy.updateMatrix();
            matrices.push(dummy.matrix.clone());
        }
        return matrices;
    }, [points]);

    useEffect(() => {
        if (meshRef.current && matrixArray.length) {
            for (let i = 0; i < matrixArray.length; i++) {
                meshRef.current.setMatrixAt(i, matrixArray[i]);
            }
            meshRef.current.instanceMatrix.needsUpdate = true;

            if (colorArray.length) {
                meshRef.current.geometry.setAttribute(
                    'color',
                    new THREE.InstancedBufferAttribute(colorArray, 3)
                );
            }
        }
    }, [matrixArray, colorArray]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[null, null, points.length]}
            castShadow
            receiveShadow
        >
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshStandardMaterial vertexColors />
        </instancedMesh>
    );
};

const CameraAdjuster = ({ points, camera, onResetCamera }) => {
    const { camera: threeCamera } = useThree();
    const [isCameraInitialized, setIsCameraInitialized] = useState(false);

    useEffect(() => {
        if (points?.length > 0 && !isCameraInitialized) {
            const flatPoints = points.flatMap(p => (Array.isArray(p) && p.length === 3 ? p.map(Number) : []));
            let minZ = Infinity, maxZ = -Infinity;
            for (let i = 2; i < flatPoints.length; i += 3) {
                const z = flatPoints[i];
                if (isFinite(z)) {
                    minZ = Math.min(minZ, z);
                    maxZ = Math.max(maxZ, z);
                }
            }
            if (isFinite(minZ) && isFinite(maxZ)) {
                const centerZ = (minZ + maxZ) / 2;
                const distance = Math.max(2.0, maxZ - minZ + 1.0);
                threeCamera.position.set(0, 0, distance);
                threeCamera.lookAt(0, 0, centerZ);
                setIsCameraInitialized(true);
            }
        }
    }, [points, threeCamera, camera, isCameraInitialized]);

    useEffect(() => {
        if (onResetCamera) {
            setIsCameraInitialized(false);
        }
    }, [onResetCamera]);

    return null;
};

const CanvasContextHandler = () => {
    const { gl } = useThree();
    useEffect(() => {
        const canvas = gl.domElement;
        const handleContextLost = (event) => {
            event.preventDefault();
            setWebGLContextLost(true);
        };
        const handleContextRestored = () => {
            setWebGLContextLost(false);
        };
        canvas.addEventListener('webglcontextlost', handleContextLost);
        canvas.addEventListener('webglcontextrestored', handleContextRestored);
        return () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost);
            canvas.removeEventListener('webglcontextrestored', handleContextRestored);
        };
    }, [gl]);
    return null;
};

const LeRobotEpisodeCard = ({ episode }) => {
    const { index, folderPath, key, video_paths, motor_data, frame_count, pointcloud_data } = episode || {};
    const [currentTime, setCurrentTime] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [hovered, setHovered] = useState(false);
    const [webGLContextLost, setWebGLContextLost] = useState(false);
    const [videoDuration, setVideoDuration] = useState(0);
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [resetCameraTrigger, setResetCameraTrigger] = useState(0);
    const playerRefs = useRef({});

    const handleDuration = useCallback((duration) => {
        if (duration && isFinite(duration)) {
            setVideoDuration(duration);
            setIsVideoLoaded(true);
        } else {
            setVideoDuration(1);
            setIsVideoLoaded(true);
        }
    }, []);

    useEffect(() => {
        Object.values(playerRefs.current).forEach((ref) => {
            if (ref) {
                if (playing) ref.getInternalPlayer()?.play?.();
                else ref.getInternalPlayer()?.pause?.();
            }
        });
    }, [playing]);

    const currentFrameData = useMemo(() => {
        if (!motor_data?.motors?.length || videoDuration <= 0) {
            return { time: 0, action: [] };
        }
        const idx = Math.min(Math.floor((currentTime / videoDuration) * motor_data.motors.length), motor_data.motors.length - 1);
        return { time: motor_data.time[idx] || 0, action: motor_data.motors[idx] || [] };
    }, [motor_data, currentTime, videoDuration]);

    const currentDataSource = useMemo(() => {
        return Array.from({ length: 6 }, (_, idx) => ({
            key: `motor_${idx}`,
            motor: `Motor ${idx}`,
            state: currentFrameData.action[idx]?.toFixed(2) || 'N/A',
            action: currentFrameData.action[idx]?.toFixed(2) || 'N/A',
        }));
    }, [currentFrameData]);

    const currentColumns = useMemo(
        () => [
            { title: 'Motor', dataIndex: 'motor', key: 'motor' },
            { title: 'State', dataIndex: 'state', key: 'state' },
            { title: 'Action', dataIndex: 'action', key: 'action' },
        ],
        []
    );

    const currentPointcloudData = useMemo(() => {
        if (!isVideoLoaded || !pointcloud_data || !pointcloud_data.cam_top || !pointcloud_data.cam_right_wrist) {
            return { cam_top: [], cam_right_wrist: [] };
        }
        const frameCount = pointcloud_data.cam_top.length;
        const idx = Math.min(
            Math.round((currentTime / videoDuration) * (frameCount - 1)),
            frameCount - 1
        );
        const camTopPoints = Array.isArray(pointcloud_data.cam_top[idx])
            ? pointcloud_data.cam_top[idx].filter(p => Array.isArray(p) && p.length === 3 && p.every(v => isFinite(v)))
            : [];
        const camRightWristPoints = Array.isArray(pointcloud_data.cam_right_wrist[idx])
            ? pointcloud_data.cam_right_wrist[idx].filter(p => Array.isArray(p) && p.length === 3 && p.every(v => isFinite(v)))
            : [];
        return {
            cam_top: camTopPoints,
            cam_right_wrist: camRightWristPoints,
        };
    }, [isVideoLoaded, pointcloud_data, currentTime, videoDuration]);

    const plotData = useMemo(() => {
        if (!motor_data?.motors?.length || videoDuration <= 0) {
            return [];
        }
        const numMotors = Math.min(motor_data.motors[0]?.length || 0, 6);
        const xValues = Array.from({ length: frame_count }, (_, i) => (i / (frame_count - 1)) * videoDuration);
        return Array.from({ length: numMotors }, (_, idx) => ({
            x: xValues,
            y: motor_data.motors.map(row => Number(row[idx]) || 0),
            type: 'scatter',
            mode: 'lines',
            name: `Motor ${idx}`,
            line: { color: `hsl(${idx * 60}, 70%, 50%)` },
        }));
    }, [motor_data, videoDuration, frame_count]);

    const plotLayout = useMemo(() => {
        const yMin = Math.min(...motor_data?.motors.flatMap(row => row.map(Number)) || [-2.5]);
        const yMax = Math.max(...motor_data?.motors.flatMap(row => row.map(Number)) || [2.5]);
        return {
            width: '100%',
            height: 400,
            title: 'Motor Data',
            xaxis: { title: 'Time (s)' },
            yaxis: { title: 'Motor Value', range: [yMin - 0.5, yMax + 0.5] },
            shapes: [
                {
                    type: 'line',
                    x0: currentTime,
                    x1: currentTime,
                    y0: yMin - 0.5,
                    y1: yMax + 0.5,
                    yref: 'y',
                    line: {
                        color: 'red',
                        width: 2,
                        dash: 'dash',
                    },
                },
            ],
        };
    }, [currentTime, motor_data, videoDuration]);

    const handleProgress = useCallback((state) => {
        setCurrentTime(state.playedSeconds);
    }, []);

    const handlePlayPause = useCallback(() => {
        setPlaying((prev) => !prev);
    }, []);

    const handleSeek = useCallback(
        (e) => {
            const newTime = parseFloat(e.target.value);
            setCurrentTime(newTime);
            Object.values(playerRefs.current).forEach((ref) => {
                if (ref) ref.seekTo(newTime / videoDuration);
            });
        },
        [videoDuration]
    );

    const handleResetCamera = useCallback(() => {
        setResetCameraTrigger(prev => prev + 1);
    }, []);

    const handleMouseEnter = () => setHovered(true);
    const handleMouseLeave = () => setHovered(false);

    return (
        <div className="episode-card">
            <h3 className="episode-title">Episode {index} ({frame_count} frames)</h3>
            {webGLContextLost && (
                <Alert
                    message="WebGL Context Lost"
                    description="The WebGL context was lost. Please refresh the page or try a different browser."
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}
            <div className="playback-area">
                <Row gutter={[16, 16]}>
                    {Object.entries(video_paths || {})
                        .filter(([_, videoPath]) => typeof videoPath === 'string' && videoPath)
                        .map(([camera, videoPath]) => (
                            <Col span={8} key={camera}>
                            <div
                                className="video-wrapper"
                                onMouseEnter={handleMouseEnter}
                                onMouseLeave={handleMouseLeave}
                            >
                                <div className="video-container">
                                    <ReactPlayer
                                        ref={(ref) => (playerRefs.current[camera] = ref)}
                                        url={videoPath}
                                        width="100%"
                                        height="100%"
                                        playing={playing}
                                        onProgress={handleProgress}
                                        onDuration={handleDuration}
                                        progressInterval={100}
                                        onError={() => {
                                            setVideoDuration(1);
                                            setIsVideoLoaded(true);
                                        }}
                                        className="video-player"
                                        style={{ background: 'transparent' }}
                                    />
                                    {hovered && (
                                        <button className="play-overlay-btn" onClick={handlePlayPause}>
                                            {playing ? '⏸' : '▶'}
                                        </button>
                                    )}
                                </div>
                                <div className="video-label">{`${camera}: ${videoPath.split('/').pop()}`}</div>
                            </div>
                        </Col>
                    ))}
                </Row>
                <div className="control-panel">
                    <button className="play-pause-btn" onClick={handlePlayPause}>
                        {playing ? '⏸' : '▶'}
                    </button>
                    <input
                        type="range"
                        min={0}
                        max={videoDuration || 1}
                        step={0.01}
                        value={currentTime}
                        onChange={handleSeek}
                        className="seek-bar"
                    />
                    <span className="time-display">
                        {currentTime.toFixed(2)} / {videoDuration.toFixed(2)}s
                    </span>
                </div>

                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={16}>
                        <div className="plot-container">
                            <Plot data={plotData} layout={plotLayout} />
                        </div>
                    </Col>
                    <Col span={8}>
                        <div className="frame-data">
                            <strong>Current Frame Data (Time: {currentTime.toFixed(2)}s)</strong>
                            <Table
                                columns={currentColumns}
                                dataSource={currentDataSource}
                                pagination={false}
                                size="small"
                                className="frame-table"
                            />
                        </div>
                    </Col>
                </Row>

                <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                    <Col span={12}>
                        <div className="pointcloud-view">
                            <h4>Point Cloud (cam_top)</h4>
                            <Button onClick={handleResetCamera} style={{ marginBottom: 8 }}>
                                Reset Camera
                            </Button>
                            {!isVideoLoaded || currentPointcloudData.cam_top.length === 0 || webGLContextLost ? (
                                <Alert
                                    message="No Point Cloud Data"
                                    description="No valid point cloud data available for cam_top or WebGL context lost."
                                    type="warning"
                                    showIcon
                                />
                            ) : (
                                <ErrorBoundary FallbackComponent={ErrorFallback}>
                                    <div style={{ width: '100%', height: '400px' }}>
                                        <Canvas
                                            camera={{ position: [0, 0, 3.0], fov: 100 }}
                                            style={{ width: '100%', height: '400px', background: '#000000' }}
                                            frameloop="always"
                                        >
                                            <CanvasContextHandler />
                                            <CameraAdjuster
                                                points={currentPointcloudData.cam_top}
                                                camera="cam_top"
                                                onResetCamera={resetCameraTrigger}
                                            />
                                            <ambientLight intensity={2.5} />
                                            <pointLight position={[2, 2, 2]} intensity={5} />
                                            <pointLight position={[-2, -2, -2]} intensity={5} />
                                            <primitive object={new THREE.AxesHelper(1)} />
                                            <gridHelper args={[2, 20, 0x444444, 0x888888]} />
                                            <PointCloud points={currentPointcloudData.cam_top} camera="cam_top" />
                                            <OrbitControls
                                                enablePan={true}
                                                enableZoom={true}
                                                enableRotate={true}
                                                minDistance={0.1}
                                                maxDistance={5}
                                            />
                                        </Canvas>
                                    </div>
                                </ErrorBoundary>
                            )}
                        </div>
                    </Col>
                    <Col span={12}>
                        <div className="pointcloud-view">
                            <h4>Point Cloud (cam_right_wrist)</h4>
                            <Button onClick={handleResetCamera} style={{ marginBottom: 8 }}>
                                Reset Camera
                            </Button>
                            {!isVideoLoaded || currentPointcloudData.cam_right_wrist.length === 0 || webGLContextLost ? (
                                <Alert
                                    message="No Point Cloud Data"
                                    description="No valid point cloud data available for cam_right_wrist or WebGL context lost."
                                    type="warning"
                                    showIcon
                                />
                            ) : (
                                <ErrorBoundary FallbackComponent={ErrorFallback}>
                                    <div style={{ width: '100%', height: '400px' }}>
                                        <Canvas
                                            camera={{ position: [0, 0, 3.0], fov: 100 }}
                                            style={{ width: '100%', height: '400px', background: '#000000' }}
                                            frameloop="always"
                                        >
                                            <CanvasContextHandler />
                                            <CameraAdjuster
                                                points={currentPointcloudData.cam_right_wrist}
                                                camera="cam_right_wrist"
                                                onResetCamera={resetCameraTrigger}
                                            />
                                            <ambientLight intensity={2.5} />
                                            <pointLight position={[2, 2, 2]} intensity={5} />
                                            <pointLight position={[-2, -2, -2]} intensity={5} />
                                            <primitive object={new THREE.AxesHelper(1)} />
                                            <gridHelper args={[2, 20, 0x444444, 0x888888]} />
                                            <PointCloud points={currentPointcloudData.cam_right_wrist} camera="cam_right_wrist" />
                                            <OrbitControls
                                                enablePan={true}
                                                enableZoom={true}
                                                enableRotate={true}
                                                minDistance={0.1}
                                                maxDistance={5}
                                            />
                                        </Canvas>
                                    </div>
                                </ErrorBoundary>
                            )}
                        </div>
                    </Col>
                </Row>
            </div>
        </div>
    );
};

export default React.memo(LeRobotEpisodeCard);
