// TODO: Destroy render targets if size changed and exists

import {Geometry} from '../core/Geometry.js';
import {Program} from '../core/Program.js';
import {Mesh} from '../core/Mesh.js';
import {RenderTarget} from '../core/RenderTarget.js';

export class Post {
    constructor(gl, {
        width,
        height,
        dpr,
        wrapS = gl.CLAMP_TO_EDGE,   //边缘拉伸
        wrapT = gl.CLAMP_TO_EDGE,
        minFilter = gl.LINEAR,  //线性采样
        magFilter = gl.LINEAR,
        //
        geometry = new Geometry(gl, {
            position: {size: 2, data: new Float32Array([-1, -1, 3, -1, -1, 3])},
            uv: {size: 2, data: new Float32Array([0, 0, 2, 0, 0, 2])},
        }),
    } = {}) {
        this.gl = gl;

        this.options = {wrapS, wrapT, minFilter, magFilter};

        this.passes = [];

        this.geometry = geometry;

        const fbo = this.fbo = {
            read: null,
            write: null,
            swap: () => {
                let temp = fbo.read;
                fbo.read = fbo.write;
                fbo.write = temp;
            },
        };

        this.resize({width, height, dpr});
    }

    addPass({
        vertex = defaultVertex,     //默认的vs
        fragment = defaultFragment, //默认的fs
        uniforms = {},
        textureUniform = 'tMap',
        enabled = true,
    } = {}) {
        uniforms[textureUniform] = {value: this.fbo.read.texture};

        //创建一个program
        const program = new Program(this.gl, {vertex, fragment, uniforms});
        //创建一个显示在屏幕的mesh
        const mesh = new Mesh(this.gl, {geometry: this.geometry, program});

        const pass = {
            mesh,
            program,
            uniforms,
            enabled,
            textureUniform,
        };

        this.passes.push(pass);
        return pass;
    }

    resize({width, height, dpr} = {}) {
        //分辨率
        if (dpr) this.dpr = dpr;
        if (width) {
            this.width = width;
            this.height = height || width;
        }

        dpr = this.dpr || this.gl.renderer.dpr;
        width = (this.width || this.gl.renderer.width) * dpr;
        height = (this.height || this.gl.renderer.height) * dpr;

        this.options.width = width;
        this.options.height = height;

        //读的RenderTarget
        this.fbo.read = new RenderTarget(this.gl, this.options);
        //写的RenderTarget
        this.fbo.write = new RenderTarget(this.gl, this.options);
    }

    // Uses same arguments as renderer.render
    render({
        scene,
        camera,
        target = null,
        update = true,
        sort = true,    //是否排序
        frustumCull = true, //视锥裁剪
    }) {
        //从多个pass的集合中，筛选出当前执行的pass
        const enabledPasses = this.passes.filter(pass => pass.enabled);

        //渲染场景，并将渲染结果保存到target上
        this.gl.renderer.render({
            scene, camera,
            target: enabledPasses.length ? this.fbo.write : target,
            update, sort, frustumCull,
        });
        //将读写缓冲区进行转换
        this.fbo.swap();

        //遍历所有执行的pass
        enabledPasses.forEach((pass, i) => {
            //将之前render出来的结果(也就是现在的fbo.read)通过unifor传入
            pass.mesh.program.uniforms[pass.textureUniform].value = this.fbo.read.texture;
            this.gl.renderer.render({
                scene: pass.mesh,   //这里只渲染一个pass的mesh，而无需对整个场景进行渲染
                target: i === enabledPasses.length - 1 ? target : this.fbo.write,   //如果当前的pass为最后一个，则直接将其渲染到屏幕上，否则将结果保存至可写缓冲区中
                clear: false,   //这里不清空上一帧的运行结果
            });
            //这里，再次将读写缓冲区对换
            this.fbo.swap();
        });
    }
}

const defaultVertex = `
    attribute vec2 uv;
    attribute vec2 position;

    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = vec4(position, 0, 1);
    }
`;

const defaultFragment = `
    precision highp float;

    uniform sampler2D tMap;
    varying vec2 vUv;

    void main() {
        gl_FragColor = texture2D(tMap, vUv);
    }
`;
