import {Transform} from './Transform.js';
import {Mat4} from '../math/Mat4.js';
import {Vec3} from '../math/Vec3.js';

const tempMat4 = new Mat4();
const tempVec3a = new Vec3();
const tempVec3b = new Vec3();

export class Camera extends Transform {
    constructor(gl, {
        near = 0.1,
        far = 100,
        fov = 45,
        aspect = 1,
        left,
        right,
        bottom,
        top,

    } = {}) {
        super(gl);

        //近裁剪面
        this.near = near;
        //远裁剪面
        this.far = far;
        //视角
        this.fov = fov;
        //宽高比
        this.aspect = aspect;

        //投影矩阵
        this.projectionMatrix = new Mat4();
        //视图矩阵
        this.viewMatrix = new Mat4();
        //视图投影矩阵
        this.projectionViewMatrix = new Mat4();

        // Use orthographic if values set, else default to perspective camera

        //平行投影还是透视投影
        if (left || right) this.orthographic({left, right, bottom, top});
        else this.perspective();
    }

    perspective({
        near = this.near,
        far = this.far,
        fov = this.fov,
        aspect = this.aspect,
    } = {}) {
        //构建透视投影矩阵
        this.projectionMatrix.fromPerspective({fov: fov * (Math.PI / 180), aspect, near, far});
        //设定type值
        this.type = 'perspective';
        return this;
    }

    orthographic({
        near = this.near,
        far = this.far,
        left = -1,
        right = 1,
        bottom = -1,
        top = 1,
    } = {}) {
        this.projectionMatrix.fromOrthogonal({left, right, bottom, top, near, far});
        this.type = 'orthographic';
        return this;
    }

    //更新相机矩阵
    updateMatrixWorld() {
        //更新世界矩阵
        super.updateMatrixWorld();

        //将视图矩阵取逆，计算世界矩阵
        this.viewMatrix.inverse(this.worldMatrix);
        // used for sorting
        //计算视图投影拒诊
        this.projectionViewMatrix.multiply(this.projectionMatrix, this.viewMatrix);
        return this;
    }

    lookAt(target) {
        super.lookAt(target, true);
        return this;
    }

    // Project 3D coordinate to 2D point
    project(v) {
        v.applyMatrix4(this.viewMatrix);
        v.applyMatrix4(this.projectionMatrix);
        return this;
    }

    // Unproject 2D point to 3D coordinate
    unproject(v) {
        //转换到投影坐标系下
        v.applyMatrix4(tempMat4.inverse(this.projectionMatrix));
        //乘相机的世界矩阵
        v.applyMatrix4(this.worldMatrix);
        return this;
    }

    updateFrustum() {
        if (!this.frustum) {
            this.frustum = [new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3(), new Vec3()];
        }

        //根据视图投影矩阵构造视锥
        const m = this.projectionViewMatrix;
        this.frustum[0].set(m[3] - m[0], m[7] - m[4], m[11] - m[8]).constant = m[15] - m[12]; // -x
        this.frustum[1].set(m[3] + m[0], m[7] + m[4], m[11] + m[8]).constant = m[15] + m[12]; // +x
        this.frustum[2].set(m[3] + m[1], m[7] + m[5], m[11] + m[9]).constant = m[15] + m[13]; // +y
        this.frustum[3].set(m[3] - m[1], m[7] - m[5], m[11] - m[9]).constant = m[15] - m[13]; // -y
        this.frustum[4].set(m[3] - m[2], m[7] - m[6], m[11] - m[10]).constant = m[15] - m[14]; // +z (far)
        this.frustum[5].set(m[3] + m[2], m[7] + m[6], m[11] + m[10]).constant = m[15] + m[14]; // -z (near)

        for (let i = 0; i < 6; i++) {
            const invLen = 1.0 / this.frustum[i].distance();
            this.frustum[i].multiply(invLen);
            this.frustum[i].constant *= invLen;
        }
    }

    //视锥裁剪
    frustumIntersectsMesh(node) {

        // If no position attribute, treat as frustumCulled false
        //如果当前对象没有坐标
        if (!node.geometry.attributes.position) return true;

        //如果当前对象未计算包围体
        if (!node.geometry.bounds || node.geometry.bounds.radius === Infinity) node.geometry.computeBoundingSphere();

        const center = tempVec3a;
        //获取包围球中心
        center.copy(node.geometry.bounds.center);
        //包围球偏移
        center.applyMatrix4(node.worldMatrix);

        const radius = node.geometry.bounds.radius * node.worldMatrix.getMaxScaleOnAxis();

        return this.frustumIntersectsSphere(center, radius);
    }

    frustumIntersectsSphere(center, radius) {
        const normal = tempVec3b;

		for (let i = 0; i < 6; i++) {
            const plane = this.frustum[i];
            const distance = normal.copy(plane).dot(center) + plane.constant;
			if (distance < -radius) return false;
		}
		return true;
    }
}
