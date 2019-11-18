import {Mesh} from '../core/Mesh.js';
import {Transform} from '../core/Transform.js';
import {Mat4} from '../math/Mat4.js';
import {Texture} from '../core/Texture.js';
import {Animation} from './Animation.js';

const tempMat4 = new Mat4();

export class Skin extends Mesh {
    constructor(gl, {
        rig,
        geometry,
        program,
        mode = gl.TRIANGLES,
    } = {}) {
        super(gl, {geometry, program, mode});

        //创建骨骼
        this.createBones(rig);
        //创建骨骼的纹理
        this.createBoneTexture();
        this.animations = [];

        Object.assign(this.program.uniforms, {
            boneTexture: {value: this.boneTexture},
            boneTextureSize: {value: this.boneTextureSize},
        });
    }

    createBones(rig) {

        // Create root so that can simply update world matrix of whole skeleton
        //创建一个根对象，用来更新某个骨骼的世界矩阵
        this.root = new Transform();
        
        // Create bones
        this.bones = [];
        if (!rig.bones || !rig.bones.length) return;

        //遍历每根骨头
        for (let i = 0; i < rig.bones.length; i++) {
            //每个骨骼是一个对象
            const bone = new Transform();

            // Set initial values (bind pose)
            //设置骨骼的初始姿态
            bone.position.fromArray(rig.bindPose.position, i * 3)
            bone.quaternion.fromArray(rig.bindPose.quaternion, i * 4);
            bone.scale.fromArray(rig.bindPose.scale, i * 3);

            this.bones.push(bone);
        };
        
        // Once created, set the hierarchy
        rig.bones.forEach((data, i) => {
            //为每个骨骼绑定名字
            this.bones[i].name = data.name;
            //如果parent属性为-1，则为root下的第一级
            if (data.parent === -1) return this.bones[i].setParent(this.root);
            this.bones[i].setParent(this.bones[data.parent]);
        });

        // Then update to calculate world matrices
        //更新root以及子级的所有骨骼的世界矩阵的世界矩阵
        this.root.updateMatrixWorld(true);

        // Store inverse of bind pose to calculate differences
        this.bones.forEach(bone => {
            //这里计算每根骨头的世界矩阵的逆(这里需要使用骨骼矩阵 * 定点矩阵来计算最终的顶点坐标，会导致姿态偏移，因此使用逆矩阵来表示变换后的顶点)
            bone.bindInverse = new Mat4(...bone.worldMatrix).inverse();
        });
    }

    //创建骨骼纹理
    createBoneTexture() {
        //如果没有骨骼
        if (!this.bones.length) return;
        //
        const size = Math.max(4, Math.pow(2, Math.ceil(Math.log(Math.sqrt(this.bones.length * 4)) / Math.LN2)));
        this.boneMatrices = new Float32Array(size * size * 4);
        this.boneTextureSize = size;
        this.boneTexture = new Texture(this.gl, {
            image: this.boneMatrices,   //这里以纹理的形式存入骨骼矩阵，这个骨骼矩阵用于保存当前帧骨骼的姿态
            generateMipmaps: false,
            type: this.gl.FLOAT,
            internalFormat: this.gl.renderer.isWebgl2 ? this.gl.RGBA16F : this.gl.RGBA,
            flipY: false,
            width: size,
        });
    }

    addAnimation(data) {
        //为每个骨骼绑定每帧的姿态
        const animation = new Animation({objects: this.bones, data});
        this.animations.push(animation);
        return animation;
    }

    update() {

        // Calculate combined animation weight
        let total = 0;
        this.animations.forEach(animation => total += animation.weight);

        this.animations.forEach((animation, i) => {

            // force first animation to set in order to reset frame
            animation.update(total, i === 0);
        });
    }

    draw({
        camera,
    } = {}) {

        // Update world matrices manually, as not part of scene graph
        this.root.updateMatrixWorld(true);

        // Update bone texture
        //如果存在骨骼
        this.bones.forEach((bone, i) => {

            // Find difference between current and bind pose
            //将当前骨骼的世界矩阵 * 绑定姿势的逆矩阵(这步用来消除坐标偏移)
            tempMat4.multiply(bone.worldMatrix, bone.bindInverse);
            //更新对应的骨骼矩阵
            this.boneMatrices.set(tempMat4, i * 16);
        });
        //设置手动更新，更新着色器中的骨骼矩阵(boneTexture)
        if (this.boneTexture) this.boneTexture.needsUpdate = true;

        //绘制
        super.draw({camera});
    }
}
