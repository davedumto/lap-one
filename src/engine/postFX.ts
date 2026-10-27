import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface PostFX {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  post: ShaderPass;
  resize: (w: number, h: number, dpr: number) => void;
  dispose: () => void;
}

export function buildPostFX(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): PostFX {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, stencilBuffer: true });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.7, 0.88);
  composer.addPass(bloom);
  const post = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uCA: { value: 0.0006 }, uWarp: { value: 0 }, uAsp: { value: 1 }, uFade: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uT,uCA,uWarp,uAsp,uFade;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233))+uT)*43758.5453); }
      void main(){ vec2 d = vUv-.5; float r = length(d*vec2(uAsp,1.));
        vec2 dir = normalize(d+1e-5);
        vec3 c;
        if(uWarp>.01){ vec3 a=vec3(0.); float w=0.; for(int i=0;i<8;i++){ float f=float(i)/8.; float k=1.-f*uWarp*.09*(0.4+r*2.); vec2 uv=.5+d*k; vec3 s=texture2D(tDiffuse,uv).rgb; a+=s; w+=1.; } c=a/w; }
        else c = texture2D(tDiffuse,vUv).rgb;
        float ca = uCA*(0.4+r*2.2)*(1.+uWarp*3.);
        c.r = mix(c.r, texture2D(tDiffuse,vUv+dir*ca).r, .75); c.b = mix(c.b, texture2D(tDiffuse,vUv-dir*ca).b, .75);
        c *= 1. - smoothstep(.45,1.1,r)*.5;
        c += (h(vUv*vec2(1731.,911.))-.5)*.03;
        c *= 1.-uFade;
        gl_FragColor = vec4(c,1.); }`,
  });
  composer.addPass(post);
  composer.addPass(new OutputPass());

  return {
    composer, bloom, post,
    resize(w: number, h: number, dpr: number) {
      composer.setPixelRatio(dpr); composer.setSize(w, h);
      bloom.setSize(w * dpr * 0.5, h * dpr * 0.5);
      post.uniforms.uAsp.value = w / h;
    },
    dispose() {
      composer.dispose();
      rt.dispose();
    },
  };
}
