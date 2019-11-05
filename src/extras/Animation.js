import {Vec3} from '../math/Vec3.js';
import {Quat} from '../math/Quat.js';

const prevPos = new Vec3();
const prevRot = new Quat();
const prevScl = new Vec3();

const nextPos = new Vec3();
const nextRot = new Quat();
const nextScl = new Vec3();

export class Animation {
    constructor({objects, data}) {
        this.objects = objects;
        this.data = data;
        this.elapsed = 0;
        this.weight = 1;
        this.duration = data.frames.length - 1;
    }

    update(totalWeight = 1, isSet) {
        const weight = isSet ? 1 : this.weight / totalWeight;

        //这里计算当前帧所处的整个动画的步长0为下一轮骨骼动画的开始
        const elapsed = this.elapsed % this.duration;

        //向下取整，计算当前帧应该执行哪组骨骼动画
        const floorFrame = Math.floor(elapsed);
        const blend = elapsed - floorFrame;
        //上一个关键帧动画
        const prevKey = this.data.frames[floorFrame];
        //下一个应该执行的关键帧动画
        const nextKey = this.data.frames[(floorFrame + 1) % this.duration];

        //遍历每根骨骼
        this.objects.forEach((object, i) => {
            //该骨骼前一个关键帧的姿态
            prevPos.fromArray(prevKey.position, i * 3)
            prevRot.fromArray(prevKey.quaternion, i * 4);
            prevScl.fromArray(prevKey.scale, i * 3);

            //该骨骼目标关键帧的姿态
            nextPos.fromArray(nextKey.position, i * 3);
            nextRot.fromArray(nextKey.quaternion, i * 4);
            nextScl.fromArray(nextKey.scale, i * 3);

            //这里对姿态进行线性插值，使其进行平滑过渡
            prevPos.lerp(nextPos, blend);
            prevRot.slerp(nextRot, blend);
            prevScl.lerp(nextScl, blend);

            //这里将最终的姿态传给最终的骨骼
            object.position.lerp(prevPos, weight);
            object.quaternion.slerp(prevRot, weight);
            object.scale.lerp(prevScl, weight);
        });
    }
}