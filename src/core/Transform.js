import {Vec3} from '../math/Vec3.js';
import {Quat} from '../math/Quat.js';
import {Mat4} from '../math/Mat4.js';
import {Euler} from '../math/Euler.js';

export class Transform {
    constructor() {
        //当前对象的父级
        this.parent = null;
        this.children = [];
        //可见性
        this.visible = true;

        //局部矩阵
        this.matrix = new Mat4();
        //世界矩阵
        this.worldMatrix = new Mat4();
        //矩阵是否每一帧自动更新
        this.matrixAutoUpdate = true;

        //坐标
        this.position = new Vec3();
        //四元数
        this.quaternion = new Quat();
        //缩放
        this.scale = new Vec3(1);
        //欧拉角
        this.rotation = new Euler();
        //上方向
        this.up = new Vec3(0, 1, 0);

        //保持四元数与欧拉角的同步更新
        this.rotation.onChange = () => this.quaternion.fromEuler(this.rotation);
        this.quaternion.onChange = () => this.rotation.fromQuaternion(this.quaternion);
    }

    //设置当前对象的父级
    setParent(parent, notifyParent = true) {
        if (notifyParent && this.parent && parent !== this.parent) this.parent.removeChild(this, false);
        this.parent = parent;

        //调用父级的addChild方法，将当前对象添加到父级的children中
        if (notifyParent && parent) parent.addChild(this, false);
    }

    addChild(child, notifyChild = true) {
        if (!~this.children.indexOf(child)) this.children.push(child);
        if (notifyChild) child.setParent(this, false);
    }

    removeChild(child, notifyChild = true) {
        if (!!~this.children.indexOf(child)) this.children.splice(this.children.indexOf(child), 1);
        if (notifyChild) child.setParent(null, false);
    }

    //更新世界矩阵
    updateMatrixWorld(force) {
        //是否自动更新世界矩阵
        if (this.matrixAutoUpdate) this.updateMatrix();

        //如果需要更新当前对象的世界矩阵
        if (this.worldMatrixNeedsUpdate || force) {
            //如果不存在父级
            if (this.parent === null) this.worldMatrix.copy(this.matrix);
            //将父级的世界矩阵与子级的局部矩阵相乘 = 当前子级的世界矩阵
            else this.worldMatrix.multiply(this.parent.worldMatrix, this.matrix);
            //设定当前对象的世界矩阵不需要更新了
            this.worldMatrixNeedsUpdate = false;
            force = true;
        }

        //当前对象存在子级，则更新子级的矩阵
        for (let i = 0, l = this.children.length; i < l; i ++) {
            this.children[i].updateMatrixWorld(force);
        }
    }

    updateMatrix() {
        this.matrix.compose(this.quaternion, this.position, this.scale);
        this.worldMatrixNeedsUpdate = true;
    }

    traverse(callback) {

        // Return true in callback to stop traversing children
        if (callback(this)) return;
        for (let i = 0, l = this.children.length; i < l; i ++) {
            this.children[i].traverse(callback);
        }
    }

    decompose() {
        this.matrix.getTranslation(this.position);
        this.matrix.getRotation(this.quaternion);
        this.matrix.getScaling(this.scale);
        this.rotation.fromQuaternion(this.quaternion);
    }

    lookAt(target, invert = false) {
        if (invert) this.matrix.lookAt(this.position, target, this.up);
        else this.matrix.lookAt(target, this.position, this.up);
        this.matrix.getRotation(this.quaternion);
        this.rotation.fromQuaternion(this.quaternion);
    };
}
