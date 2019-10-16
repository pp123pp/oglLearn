import {Transform} from './Transform.js';
import {Mat3} from '../math/Mat3.js';
import {Mat4} from '../math/Mat4.js';

let ID = 0;

export class Mesh extends Transform {
    constructor(gl, {
        geometry,
        program,
        mode = gl.TRIANGLES,    //绘制模式
        frustumCulled = true,   //视锥裁剪
        renderOrder = 0,
    } = {}) {
        super(gl);
        this.gl = gl;
        this.id = ID++; //mesh ID自加

        this.geometry = geometry;
        this.program = program;
        this.mode = mode;

        // Used to skip frustum culling
        this.frustumCulled = frustumCulled;

        // Override sorting to force an order
        this.renderOrder = renderOrder;

        this.modelViewMatrix = new Mat4();
        this.normalMatrix = new Mat3();

        this.beforeRenderCallbacks = [];
        this.afterRenderCallbacks = [];
    }

    onBeforeRender(f) {
        this.beforeRenderCallbacks.push(f);
        return this;
    }

    onAfterRender(f) {
        this.afterRenderCallbacks.push(f);
        return this;
    }

    draw({
        camera,
    } = {}) {
        this.beforeRenderCallbacks.forEach(f => f && f({mesh: this, camera}));

        // Set the matrix uniforms
        if (camera) {

            // Add empty matrix uniforms to program if unset
            if (!this.program.uniforms.modelMatrix) {
                Object.assign(this.program.uniforms, {
                    modelMatrix: {value: null},
                    viewMatrix: {value: null},
                    modelViewMatrix: {value: null},
                    normalMatrix: {value: null},
                    projectionMatrix: {value: null},
                    cameraPosition: {value: null},
                });
            }

            this.program.uniforms.projectionMatrix.value = camera.projectionMatrix;
            this.program.uniforms.cameraPosition.value = camera.position;
            this.program.uniforms.viewMatrix.value = camera.viewMatrix;

            this.modelViewMatrix.multiply(camera.viewMatrix, this.worldMatrix);
            this.normalMatrix.getNormalMatrix(this.modelViewMatrix);

            this.program.uniforms.modelMatrix.value = this.worldMatrix;
            this.program.uniforms.modelViewMatrix.value = this.modelViewMatrix;
            this.program.uniforms.normalMatrix.value = this.normalMatrix;
        }

        // determine if faces need to be flipped - when mesh scaled negatively
        //这里如果对象的矩阵的行列式<0，则产生镜像，此时三角面需要进行翻转
        let flipFaces = this.program.cullFace && this.worldMatrix.determinant() < 0;

        //是否执行面翻转
        this.program.use({flipFaces});
        this.geometry.draw({mode: this.mode, program: this.program});

        this.afterRenderCallbacks.forEach(f => f && f({mesh: this, camera}));
    }
}