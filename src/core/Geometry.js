// attribute params
// {
//     data - typed array eg UInt16Array for indices, Float32Array
//     size - int default 1
//     instanced - default null. Pass divisor amount
//     type - gl enum default gl.UNSIGNED_SHORT for 'index', gl.FLOAT for others
//     normalize - boolean default false
// }

// TODO: fit in transform feedback
// TODO: when would I disableVertexAttribArray ?
// TODO: add fallback for non vao support (ie)

import {Vec3} from '../math/Vec3.js';

const tempVec3 = new Vec3();

let ID = 0;
let ATTR_ID = 0;

export class Geometry {
    constructor(gl, attributes = {}) {
        //webgl上下文
        this.gl = gl;
        //attribute数据
        this.attributes = attributes;
        //场景ID自加1
        this.id = ID++;

        // Store one VAO per program attribute locations order
        //保存顶点数组对象(VAO)
        this.VAOs = {};

        this.drawRange = {start: 0, count: 0};
        this.instancedCount = 0;

        // Unbind current VAO so that new buffers don't get added to active mesh
        //将顶点数组对象解绑
        this.gl.renderer.bindVertexArray(null);
        this.gl.renderer.currentGeometry = null;

        // Alias for state store to avoid redundant calls for global state
        this.glState = this.gl.renderer.state;

        // create the buffers
        //遍历创建的attribute并创建buffer
        for (let key in attributes) {
            this.addAttribute(key, attributes[key]);
        }
    }

    addAttribute(key, attr) {
        //保存attribute
        this.attributes[key] = attr;

        // Set options
        attr.id = ATTR_ID++;
        //设定分组值
        attr.size = attr.size || 1;
        //设定输入的数据类型
        attr.type = attr.type || (
            attr.data.constructor === Float32Array ? this.gl.FLOAT :
            attr.data.constructor === Uint16Array ? this.gl.UNSIGNED_SHORT :
            this.gl.UNSIGNED_INT); // Uint32Array

        //判断当前的attribute是否为index，并设定不同的存储目标
        attr.target = key === 'index' ? this.gl.ELEMENT_ARRAY_BUFFER : this.gl.ARRAY_BUFFER;
        //是否归一化
        attr.normalize = attr.normalize || false;
        //创建一个buffer
        attr.buffer = this.gl.createBuffer();
        //顶点数量
        attr.count = attr.data.length / attr.size;
        attr.divisor = attr.instanced || 0;
        attr.needsUpdate = false;

        // Push data to buffer
        //将数据存到buffer中
        this.updateAttribute(attr);

        // Update geometry counts. If indexed, ignore regular attributes
        if (attr.divisor) {
            this.isInstanced = true;
            if (this.instancedCount && this.instancedCount !== attr.count * attr.divisor) {
                console.warn('geometry has multiple instanced buffers of different length');
                return this.instancedCount = Math.min(this.instancedCount, attr.count * attr.divisor);
            }
            this.instancedCount = attr.count * attr.divisor;
        } else if (key === 'index') {
            //如果当前数据为index
            this.drawRange.count = attr.count;
        } else if (!this.attributes.index) {
            this.drawRange.count = Math.max(this.drawRange.count, attr.count);
        }
    }

    updateAttribute(attr) {

        // Already bound, prevent gl command
        //如果当前attribute未绑定到缓冲区中（即，在boundBuffer中没有当前id）
        if (this.glState.boundBuffer !== attr.id) {
            //绑定缓冲区
            this.gl.bindBuffer(attr.target, attr.buffer);
            //保存id
            this.glState.boundBuffer = attr.id;
        }
        //在缓冲区中写入数据,gl.STATIC_DRAW:只像缓冲区中写入一次数据，然后绘制多次
        this.gl.bufferData(attr.target, attr.data, this.gl.STATIC_DRAW);
        attr.needsUpdate = false;
    }

    setIndex(value) {
        this.addAttribute('index', value);
    }

    setDrawRange(start, count) {
        this.drawRange.start = start;
        this.drawRange.count = count;
    }

    setInstancedCount(value) {
        this.instancedCount = value;
    }

    createVAO(program) {
        //创建一个VAO对象
        this.VAOs[program.attributeOrder] = this.gl.renderer.createVertexArray();
        //绑定VAO
        this.gl.renderer.bindVertexArray(this.VAOs[program.attributeOrder]);
        this.bindAttributes(program);
    }

    bindAttributes(program) {

        // Link all attributes to program using gl.vertexAttribPointer
        //遍历所有的attribute
        program.attributeLocations.forEach((location, name) => {

            // If geometry missing a required shader attribute
            if (!this.attributes[name]) {
                console.warn(`active attribute ${name} not being supplied`);
                return;
            }

            const attr = this.attributes[name];

            //将buffer与target进行绑定
            this.gl.bindBuffer(attr.target, attr.buffer);
            this.glState.boundBuffer = attr.id;
            //将缓冲区对象绑定到着色器变量中
            this.gl.vertexAttribPointer(
                location,
                attr.size,
                attr.type,
                attr.normalize,
                0, // stride
                0 // offset
            );
            this.gl.enableVertexAttribArray(location);

            // For instanced attributes, divisor needs to be set.
            // For firefox, need to set back to 0 if non-instanced drawn after instanced. Else won't render
            this.gl.renderer.vertexAttribDivisor(location, attr.divisor);
        });

        // Bind indices if geometry indexed
        if (this.attributes.index) this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.attributes.index.buffer);
    }

    /**
     * 几何体绘制
     * @param program
     * @param mode
     */
    draw({
        program,
        mode = this.gl.TRIANGLES,   //绘制模式：默认为三角网
    }) {
        if (this.gl.renderer.currentGeometry !== `${this.id}_${program.attributeOrder}`) {
            //创建VAO
            if (!this.VAOs[program.attributeOrder]) this.createVAO(program);
            //绑定VAO
            this.gl.renderer.bindVertexArray(this.VAOs[program.attributeOrder]);
            this.gl.renderer.currentGeometry = `${this.id}_${program.attributeOrder}`;
        }

        // Check if any attributes need updating
        //遍历所有attribute
        program.attributeLocations.forEach((location, name) => {
            const attr = this.attributes[name];
            //更新buffer中的数据
            if (attr.needsUpdate) this.updateAttribute(attr);
        });

        //当前geometry是否为instance
        if (this.isInstanced) {
            if (this.attributes.index) {
                this.gl.renderer.drawElementsInstanced(mode, this.drawRange.count, this.attributes.index.type, this.drawRange.start, this.instancedCount);
            } else {
                this.gl.renderer.drawArraysInstanced(mode, this.drawRange.start, this.drawRange.count, this.instancedCount);
            }
        } else {
            //如果当前的attribute为index
            if (this.attributes.index) {
                //通过索引绘制
                this.gl.drawElements(mode, this.drawRange.count, this.attributes.index.type, this.drawRange.start);
            } else {
                //通过顶点绘制
                this.gl.drawArrays(mode, this.drawRange.start, this.drawRange.count);
            }
        }
    }

    /*
    此处拿到最大最小边界数据，算包围盒
     */
    computeBoundingBox(array) {

        // Use position buffer if available
        if (!array && this.attributes.position) array = this.attributes.position.data;
        if (!array) console.warn('No position buffer found to compute bounds');

        if (!this.bounds) {
            this.bounds = {
                min: new Vec3(),
                max: new Vec3(),
                center: new Vec3(),
                scale: new Vec3(),
                radius: Infinity,
            };
        }

        const min = this.bounds.min;
        const max = this.bounds.max;
        const center = this.bounds.center;
        const scale = this.bounds.scale;

        min.set(+Infinity);
        max.set(-Infinity);

        for (let i = 0, l = array.length; i < l; i += 3) {
            const x = array[i];
            const y = array[i + 1];
            const z = array[i + 2];

            min.x = Math.min(x, min.x);
            min.y = Math.min(y, min.y);
            min.z = Math.min(z, min.z);

            max.x = Math.max(x, max.x);
            max.y = Math.max(y, max.y);
            max.z = Math.max(z, max.z);
        }

        scale.sub(max, min);
        center.add(min, max).divide(2);
    }

    //计算包围球
    computeBoundingSphere(array) {

        // Use position buffer if available
        if (!array && this.attributes.position) array = this.attributes.position.data;
        if (!array) console.warn('No position buffer found to compute bounds');

        //计算包围盒
        if (!this.bounds) this.computeBoundingBox(array);

        let maxRadiusSq = 0;
        for (let i = 0, l = array.length; i < l; i += 3) {
            tempVec3.fromArray(array, i);
            maxRadiusSq = Math.max(maxRadiusSq, this.bounds.center.squaredDistance(tempVec3));
        }

        this.bounds.radius = Math.sqrt(maxRadiusSq);
    }

    remove() {
        if (this.vao) this.gl.renderer.deleteVertexArray(this.vao);
        for (let key in this.attributes) {
            this.gl.deleteBuffer(this.attributes[key].buffer);
            delete this.attributes[key];

        }
    }
}
