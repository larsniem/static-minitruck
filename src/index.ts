// Typescript allow implicit any type
// @ts-nocheck

import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

import CubeExample from './demos/Cube.ts.demo?raw'
import HammerExample from './demos/Hammer.ts.demo?raw'
import MinitruckExample from './demos/Minitruck.ts.demo?raw'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    return new editorWorker()
  }
}

import init from "./truck/truck_js";
import * as Truck from "./truck/truck_js";
import truck_js_dts from "./truck/truck_js.d.ts?raw";

const examples = {
  "cube": CubeExample,
  "hammer": HammerExample,
  "minitruck": MinitruckExample,
}

let cw = 768;
let ch = 768;

let canvas, gl;

let mouse = [0.0, 0.0];
let rotflag = false;
let panFlag = false;
let zoomFlag = false;
let cameraPosition = [0.0, 0.0, 3.0];
let cameraDirection = [0.0, 0.0, -1.0];
let cameraUpdirection = [0.0, 1.0, 0.0];
let cameraGaze = [0.0, 0.0, 0.0];
const fps = 1000 / 30;

let vAttributes;
let vIndex;

let vPositionLocation, vUVLocation, vNormalLocation;
let uniLocation;

class RederableObject {
  geometry;
  object;
  polygon: Truck.Polygon;
  vBuffer;
  iBuffer;
  indexLength;

  // GL Buffers
  vAttributes;
  vIndex;
}

let renderableObjects: Array<RederableObject> = [];

let polygons = null;
let objects = null;
let vBuffer = null;
let iBuffer = null;
let indexLength = null;

let loaded = true;

if (document.readyState !== "loading") {
  onLoad();
} else {
  addEventListener("load", onLoad, false);
}

async function onLoad() {
  
  // Bind event handlers
  document.getElementById("select-example").addEventListener("change", loadExample);

  document.getElementsByClassName("command run")[0].addEventListener("click", run);
  document.getElementsByClassName("command save-code")[0].addEventListener("click", downloadCode);
  document.getElementsByClassName("command save-json")[0].addEventListener("click", downloadJSON);
  document.getElementsByClassName("command save-step")[0].addEventListener("click", downloadStep);
  document.getElementsByClassName("command save-obj")[0].addEventListener("click", downloadObj);
  document.getElementsByClassName("command open")[0].addEventListener("click", openCode);
  
  // Editor
  setupEditor();
  
  await init();

  // Truck
  canvas = document.getElementById("canvas");
  cw = document.getElementById("canvas")!.clientWidth;
  ch = document.getElementById("canvas")!.clientHeight;

  canvas.width = cw;
  canvas.height = ch;

  canvas.addEventListener("mousemove", mouseMove);
  canvas.addEventListener("mousedown", mouseDown);
  canvas.addEventListener("mouseup", mouseUp);

  gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true }) ||
    canvas.getContext("experimental-webgl", { preserveDrawingBuffer: true });

  const prg = createProgram(
    createShader("vertexshader"),
    createShader("fragmentshader"),
  );
  uniLocation = [
    gl.getUniformLocation(prg, "camera_position"),
    gl.getUniformLocation(prg, "camera_direction"),
    gl.getUniformLocation(prg, "camera_updirection"),
    gl.getUniformLocation(prg, "resolution"),
  ];

  gl.enable(gl.CULL_FACE);
  gl.enable(gl.DEPTH_TEST);

  vPositionLocation = gl.getAttribLocation(prg, "position");
  vUVLocation = gl.getAttribLocation(prg, "uv");
  vNormalLocation = gl.getAttribLocation(prg, "normal");

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clearDepth(1.0);

  await run();
}

function loadExample(e) {
  const example = examples[e.target.value];
  monaco.editor.getModels()[0].setValue(example);
  run();
}

function getCode() {
  return monaco.editor.getModels()[0].getValue();
}

async function run() {
  const root = document.getElementsByTagName("html")[0];
  root.setAttribute("state", "running")

  // allow interupt to update UI, 100 miliseconds ensures codes gets upated in editor with syntax highlighting
  await new Promise(resolve => setTimeout(resolve, 100));

  // get code from monaco editor
  let editorCode = getCode();
  if (editorCode.trim() == "") {
    return;
  }

  let code = `
    ${getCode()}
    return run();
  `

  let solids = await execute(code);
  renderableObjects = instanciateModels(solids);
  loaded = true;

  root.setAttribute("state", "ok")
  
  render();
}

async function execute(code) {
  let solids: Truck.Solid[] = [];
  // create a function with one input argument from a string
  const msg = "Oh, no something is wrong with the code 😖";
  try {
    let modeling_function = new Function("Truck", code);
    solids = modeling_function(Truck);

    if (solids[0] === undefined) {
      throw new Error(msg);
    }
  } catch (e) {
    console.error(e);
    alert(msg+"\n"+e.message);
    root.setAttribute("state", "error")
    return;
  }

  return solids;
}

function instanciateModel(solids) {
  vBuffer = new Float32Array(0);
  iBuffer = new Uint32Array(0);

  polygons = solids.to_polygon(0.01);
  objects = polygons.to_buffer();
  vBuffer = objects.vertex_buffer();
  iBuffer = objects.index_buffer();
  indexLength = objects.index_buffer_size() / 4;
}

function instanciateModels(solids): Array<RederableObject> {
  const objects: Array<RederableObject> = solids.map(solid => {
    const object: RederableObject = {
      geometry: solid,
      polygon: solid.to_polygon(0.01),
    };
    object.object = object.polygon.to_buffer();
    object.vBuffer = object.object.vertex_buffer();
    object.iBuffer = object.object.index_buffer();
    object.indexLength = object.object.index_buffer_size() / 4;
    return object;
  });

  return objects;
}

function setupEditor() {
  // Editor
  let editorContainer = document.getElementById("editor")!;

  // Typescript/Javascript settings
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });
  
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2016,
    allowNonTsExtensions: true,
  });

  let editor = monaco.editor.create(editorContainer!, {
    value: examples["cube"],
    automaticLayout: true,
    language: "typescript",
    theme: "vs-dark",
    scrollBeyondLastLine: false,
    minimap: {
      enabled: false,
    },
    lightbulb: {
      enabled: true,
    },
  });

  // Keybindings
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyB, run);

  // Prevent window defaults
  window.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.key === "s") {
      e.preventDefault();
      downloadCode(e);
    }
     if (e.ctrlKey && e.key === "o") {
      e.preventDefault();
      openCode(e);
     }
  });

  // Additional modules
  let libSource = "declare module Truck {\n" + truck_js_dts + "\n}";
  var libUri = "truck.d.ts";
  monaco.languages.typescript.typescriptDefaults.addExtraLib(libSource, libUri);
}

function render() {
  if (loaded && renderableObjects) {
    for (const renderableObject of renderableObjects) {
      renderableObject.vAttributes = createVbo(renderableObject.vBuffer);
      renderableObject.vIndex = createIbo(renderableObject.iBuffer);
    }
    loaded = false;
  }

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.uniform3fv(uniLocation[0], cameraPosition);
  gl.uniform3fv(uniLocation[1], cameraDirection);
  gl.uniform3fv(uniLocation[2], cameraUpdirection);
  gl.uniform2fv(uniLocation[3], [canvas.width, canvas.height]);

  for (const rendable of renderableObjects) {
    gl.bindBuffer(gl.ARRAY_BUFFER, rendable.vAttributes);
  }


  gl.enableVertexAttribArray(vPositionLocation);
  gl.vertexAttribPointer(
    vPositionLocation,
    3,
    gl.FLOAT,
    false,
    3 * 4 + 2 * 4 + 3 * 4,
    0,
  );
  gl.enableVertexAttribArray(vUVLocation);
  gl.vertexAttribPointer(
    vUVLocation,
    2,
    gl.FLOAT,
    false,
    3 * 4 + 2 * 4 + 3 * 4,
    3 * 4,
  );
  gl.enableVertexAttribArray(vNormalLocation);
  gl.vertexAttribPointer(
    vNormalLocation,
    3,
    gl.FLOAT,
    false,
    3 * 4 + 2 * 4 + 3 * 4,
    2 * 4 + 3 * 4,
  );

  for (const renderableObject of renderableObjects) {
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, renderableObject.vIndex);
    gl.drawElements(gl.TRIANGLES, renderableObject.indexLength, gl.UNSIGNED_SHORT, 0);
    gl.flush();
  }


  setTimeout(render, fps);
}

function rotation(origin, axis, theta, vec) {
  vec = [
    vec[0] - origin[0],
    vec[1] - origin[1],
    vec[2] - origin[2],
  ];
  vec = [
    (axis[0] * axis[0] * (1.0 - Math.cos(theta)) + Math.cos(theta)) * vec[0] +
    (axis[0] * axis[1] * (1.0 - Math.cos(theta)) - axis[2] * Math.sin(theta)) *
      vec[1] +
    (axis[0] * axis[2] * (1.0 - Math.cos(theta)) + axis[1] * Math.sin(theta)) *
      vec[2],
    (axis[0] * axis[1] * (1.0 - Math.cos(theta)) + axis[2] * Math.sin(theta)) *
      vec[0] +
    (axis[1] * axis[1] * (1.0 - Math.cos(theta)) + Math.cos(theta)) * vec[1] +
    (axis[1] * axis[2] * (1.0 - Math.cos(theta)) - axis[0] * Math.sin(theta)) *
      vec[2],
    (axis[0] * axis[2] * (1.0 - Math.cos(theta)) - axis[1] * Math.sin(theta)) *
      vec[0] +
    (axis[1] * axis[2] * (1.0 - Math.cos(theta)) + axis[0] * Math.sin(theta)) *
      vec[1] +
    (axis[2] * axis[2] * (1.0 - Math.cos(theta)) + Math.cos(theta)) * vec[2],
  ];
  return [
    vec[0] + origin[0],
    vec[1] + origin[1],
    vec[2] + origin[2],
  ];
}

function mouseMove(e) {
  const offset = [e.offsetX, e.offsetY];
  if (rotflag) {
    const diff = [offset[0] - mouse[0], mouse[1] - offset[1]];
    if (diff[0] == 0 || diff[1] == 0) return;
    diff[0] *= 0.01;
    diff[1] *= 0.01;
    const cameraRightdirection = [
      cameraDirection[1] * cameraUpdirection[2] -
      cameraDirection[2] * cameraUpdirection[1],
      cameraDirection[2] * cameraUpdirection[0] -
      cameraDirection[0] * cameraUpdirection[2],
      cameraDirection[0] * cameraUpdirection[1] -
      cameraDirection[1] * cameraUpdirection[0],
    ];
    const axis = [
      diff[0] * cameraUpdirection[0] - diff[1] * cameraRightdirection[0],
      diff[0] * cameraUpdirection[1] - diff[1] * cameraRightdirection[1],
      diff[0] * cameraUpdirection[2] - diff[1] * cameraRightdirection[2],
    ];
    const len = Math.sqrt(
      axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2],
    );
    axis[0] /= len;
    axis[1] /= len;
    axis[2] /= len;
    cameraPosition = rotation(cameraGaze, axis, -len, cameraPosition);
    cameraDirection = rotation([0.0, 0.0, 0.0], axis, -len, cameraDirection);
    cameraUpdirection = rotation(
      [0.0, 0.0, 0.0],
      axis,
      -len,
      cameraUpdirection,
    );
  } else if (panFlag) {
    const diff = [offset[0] - mouse[0], mouse[1] - offset[1]];
    if (diff[0] == 0 || diff[1] == 0) return;
    diff[0] *= 0.005;
    diff[1] *= 0.005;
    const cameraRightdirection = [
      cameraDirection[1] * cameraUpdirection[2] -
      cameraDirection[2] * cameraUpdirection[1],
      cameraDirection[2] * cameraUpdirection[0] -
      cameraDirection[0] * cameraUpdirection[2],
      cameraDirection[0] * cameraUpdirection[1] -
      cameraDirection[1] * cameraUpdirection[0],
    ];
    cameraPosition[0] -= diff[0] * cameraRightdirection[0];
    cameraPosition[1] -= diff[0] * cameraRightdirection[1];
    cameraPosition[2] -= diff[0] * cameraRightdirection[2];
    cameraPosition[0] -= diff[1] * cameraUpdirection[0];
    cameraPosition[1] -= diff[1] * cameraUpdirection[1];
    cameraPosition[2] -= diff[1] * cameraUpdirection[2];
    cameraGaze[0] -= diff[0] * cameraRightdirection[0];
    cameraGaze[1] -= diff[0] * cameraRightdirection[1];
    cameraGaze[2] -= diff[0] * cameraRightdirection[2];
    cameraGaze[0] -= diff[1] * cameraUpdirection[0];
    cameraGaze[1] -= diff[1] * cameraUpdirection[1];
    cameraGaze[2] -= diff[1] * cameraUpdirection[2];
  } else if (zoomFlag) {
    let diff = offset[1] - mouse[1];
    if (diff == 0)
      return;
    diff *= -0.01;
    cameraPosition[0] += diff * cameraDirection[0];
    cameraPosition[1] += diff * cameraDirection[1];
    cameraPosition[2] += diff * cameraDirection[2];
    cameraGaze[0] += diff * cameraDirection[0];
    cameraGaze[1] += diff * cameraDirection[1];
    cameraGaze[2] += diff * cameraDirection[2];
  }
  mouse = offset;
}

function mouseDown(e) {
  if (e.button == 0) {
    rotflag = true;
  } else if (e.button == 1) {
    panFlag = true;
  } else if (e.button == 2) {
    zoomFlag = true;
  }
}

function mouseUp(e) {
  rotflag = false;
  panFlag = false;
  zoomFlag = false;
}

function fileRead(e) {
  e.preventDefault();
  const file0 = this.files[0];
  if (typeof file0 === "undefined") {
    console.warn("invalid input");
    return;
  }
  console.log(file0.name);
  const file_ext = file0.name.split(".").pop();

  const reader = new FileReader();
  reader.readAsArrayBuffer(file0);
  reader.onload = function () {
    const result = new Uint8Array(reader.result);

    let shape;
    if (file_ext === "json") {
      shape = Truck.Solid.from_json(result);
      if (typeof shape === "undefined") {
        console.warn("invalid json");
        return;
      }
    } else if (file_ext === "step" || file_ext === "stp") {
      const step_str = String.fromCharCode(...result);
      const table = Truck.Table.from_step(step_str);
      const indices = table.shell_indices();
      shape = table.get_shape(indices[0]);
      if (typeof shape === "undefined") {
        console.warn("invalid step");
        return;
      }
    }
    polygons = shape.to_polygon(0.01);
    if (typeof polygons === "undefined") {
      console.warn("meshing failed");
      return;
    }
    const box = polygons.bounding_box();
    const scale = Math.max(
      box[3] - box[0],
      box[4] - box[1],
      box[5] - box[2],
    ) * 2.0;
    const boxCenter = [
      (box[0] + box[3]) / 2.0,
      (box[1] + box[4]) / 2.0,
      (box[2] + box[5]) / 2.0,
    ];
    cameraPosition = [boxCenter[0], boxCenter[1], scale + boxCenter[2]];
    cameraDirection = [0.0, 0.0, -1.0];
    cameraUpdirection = [0.0, 1.0, 0.0];
    cameraGaze = boxCenter;
    cameraGaze = boxCenter;
    const object = polygons.to_buffer();
    vBuffer = object.vertex_buffer();
    iBuffer = object.index_buffer();
    indexLength = object.index_buffer_size() / 4;
    loaded = true;
  };
}

function openCode(e) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ts';
  
  input.onchange = e => { 
     // getting a hold of the file reference
     var file = e.target.files[0]; 
  
     // setting up the reader
     var reader = new FileReader();
     reader.readAsText(file,'UTF-8');
  
     // here we tell the reader what to do when it's done reading...
     reader.onload = readerEvent => {
        var content = readerEvent.target.result; // this is the content!
        monaco.editor.getModels()[0].setValue(content);
     }
  }
  
  input.click();
}

function downloadCode(e) {
  e.preventDefault();
  const code = getCode();

  const blob = new Blob([code], {
    type: "text/plain",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.download = "code.ts";
  a.href = url;
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadJSON(e) {
  e.preventDefault();
  const json = renderableObjects[0].geometry.to_json();

  const blob = new Blob([json], {
    type: "text/plain",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.download = "MiniTruckPart.mtp";
  a.href = url;
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadStep(e) {
  e.preventDefault();
  const filename = "MiniTruckPart.step";

  const header = Truck.StepHeaderDescriptor.create();
  header.authors = "Created with MiniTruck!"; // 🛻🗯️";
  header.filename = filename;
  header.time_stamp = new Date().toISOString();

  const step = renderableObjects[0].geometry.to_step(header);

  const blob = new Blob([step], {
    type: "text/plain",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.download = filename;
  a.href = url;
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadObj(e) {
  const obj = renderableObjects[0].polygon.to_obj();
  if (typeof obj === "undefined") {
    console.warn("Failed to generate obj.");
    return;
  }
  const blob = new Blob([(new TextDecoder()).decode(obj)], {
    type: "text/plain",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  document.body.appendChild(a);
  a.download = "meshdata.obj";
  a.href = url;
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function createProgram(vs, fs) {
  const program = gl.createProgram();

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);

  gl.linkProgram(program);

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.useProgram(program);
    return program;
  } else {
    alert(gl.getProgramInfoLog(program));
  }
}

function createShader(id) {
  let shader;

  const scriptElement = document.getElementById(id);
  if (!scriptElement) return;

  switch (scriptElement.type) {
    case "x-shader/x-vertex":
      shader = gl.createShader(gl.VERTEX_SHADER);
      break;
    case "x-shader/x-fragment":
      shader = gl.createShader(gl.FRAGMENT_SHADER);
      break;
    default:
      return;
  }

  gl.shaderSource(shader, scriptElement.text);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader;
  } else {
    alert(gl.getShaderInfoLog(shader));
  }
}

function createVbo(data) {
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return vbo;
}

function createIbo(data) {
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  return ibo;
}