/* Offline 2.5D illustration stage. All motion is a pure function of supplied time.
 * Raster figures use bounded local deformation, not skeletal or volumetric animation.
 * Keep action-bearing physical mechanisms in the mesh runtime.
 */
(function (root) {
  'use strict';
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { x = clamp(x); return x*x*x*(x*(x*6-15)+10); };
  function sample(config, seconds, duration) {
    const t = Math.max(0, Math.min(duration, seconds)), p = t / duration;
    return {
      zoom: config.staticCamera ? 1 : 1.025 + .024 * smooth(p),
      drift: config.staticCamera ? [0,0] : [.003 * smooth(p), -.002 * smooth(p)],
      joints: (config.joints || []).map(j => {
        const action = smooth((t - (j.start || 0)) / (j.duration || 2));
        const breath = Math.sin(t * (j.frequency || 1.3) + (j.phase || 0)) - Math.sin(j.phase || 0);
        return {region:j.region, delta:[(j.dx || 0)*action, (j.dy || 0)*action + (j.breath || 0)*breath, (j.angle || 0)*action]};
      })
    };
  }
  function mount(canvas, image, config) {
    if (!image.complete || !image.naturalWidth) throw new Error('Illustration image is not decoded');
    if (!Number.isFinite(config.duration) || !(config.duration > 0) || (config.joints || []).length > 8) throw new Error('Invalid illustration timeline');
    for (const j of config.joints || []) {
      if (!Array.isArray(j.region) || j.region.length !== 4 || !j.region.every(Number.isFinite) || j.region[2] <= 0 || j.region[3] <= 0)
        throw new Error('Invalid illustration motion region');
      for (const key of ['angle','dx','dy','breath','start','duration','phase','frequency']) {
        if (j[key] !== undefined && !Number.isFinite(j[key])) throw new Error('Non-finite illustration motion parameter');
      }
      if (j.duration !== undefined && j.duration <= 0) throw new Error('Invalid illustration action duration');
      if (Math.abs(j.angle || 0) > .09 || Math.abs(j.dx || 0) > .025 || Math.abs(j.dy || 0) > .025 || Math.abs(j.breath || 0) > .004)
        throw new Error('Illustration deformation exceeds the subtle-motion limit; use a rig for larger actions');
    }
    const gl = canvas.getContext('webgl', {alpha:false, antialias:false, preserveDrawingBuffer:true});
    if (!gl) throw new Error('WebGL is unavailable');
    const shader = (type, source) => {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 a;varying vec2 v;void main(){v=vec2((a.x+1.)*.5,(1.-a.y)*.5);gl_Position=vec4(a,0.,1.);}'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, `precision highp float;
      varying vec2 v; uniform sampler2D picture; uniform vec2 crop; uniform float zoom;
      uniform vec2 drift; uniform vec4 regions[8]; uniform vec3 deltas[8];
      void main(){
        vec2 uv=(v-.5)*crop/zoom+.5+drift;
        vec2 source=uv;
        for(int i=0;i<8;i++){
          vec4 r=regions[i]; vec2 q=(uv-r.xy)/max(r.zw,vec2(.0001));
          float w=1.-smoothstep(.15,1.,dot(q,q));
          vec3 d=deltas[i]; float angle=-d.z*w; vec2 rel=source-r.xy;
          source=r.xy+mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*rel-d.xy*w;
        }
        gl_FragColor=texture2D(picture,clamp(source,.001,.999));
      }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const a=gl.getAttribLocation(program,'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
    const texture=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    const locations=Object.fromEntries(['crop','zoom','drift','regions[0]','deltas[0]'].map(k=>[k,gl.getUniformLocation(program,k)]));
    let lastTime=0, frames=0;
    function draw(seconds, duration=config.duration) {
      const state=sample(config,seconds,duration), regions=new Float32Array(32), deltas=new Float32Array(24);
      state.joints.forEach((j,i)=>{regions.set(j.region,i*4);deltas.set(j.delta,i*3);});
      const imageAspect=image.naturalWidth/image.naturalHeight, screenAspect=canvas.width/canvas.height;
      gl.viewport(0,0,canvas.width,canvas.height); gl.useProgram(program);
      gl.uniform2f(locations.crop, Math.min(1,screenAspect/imageAspect),Math.min(1,imageAspect/screenAspect));
      gl.uniform1f(locations.zoom,state.zoom); gl.uniform2fv(locations.drift,state.drift);
      gl.uniform4fv(locations['regions[0]'],regions); gl.uniform3fv(locations['deltas[0]'],deltas);
      gl.drawArrays(gl.TRIANGLES,0,6); lastTime=seconds; frames++;
    }
    draw(0);
    return {draw, diagnostics:()=>({kind:'illustration2.5d',frames,lastTime,joints:(config.joints||[]).length}),
      dispose(){gl.deleteTexture(texture);gl.deleteBuffer(buffer);gl.deleteProgram(program);}};
  }
  const api={mount,sample};
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.ILLUSTRATED_SCENE=api;
})(typeof window==='object'?window:globalThis);
