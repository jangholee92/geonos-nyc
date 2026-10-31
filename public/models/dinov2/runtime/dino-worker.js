//#region \0rolldown/runtime.js
var e = /* @__PURE__ */ ((e) => typeof require < "u" ? require : typeof Proxy < "u" ? new Proxy(e, { get: (e, t) => (typeof require < "u" ? require : e)[t] }) : e)(function(e) {
	if (typeof require < "u") return require.apply(this, arguments);
	throw Error("Calling `require` for \"" + e + "\" in an environment that doesn't expose the `require` function. See https://rolldown.rs/in-depth/bundling-cjs#require-external-modules for more details.");
}), t = Object.defineProperty, n = Object.getOwnPropertyDescriptor, r = Object.getOwnPropertyNames, i = Object.prototype.hasOwnProperty, a = ((t) => typeof e < "u" ? e : typeof Proxy < "u" ? new Proxy(t, { get: (t, n) => (typeof e < "u" ? e : t)[n] }) : t)(function(t) {
	if (typeof e < "u") return e.apply(this, arguments);
	throw Error("Dynamic require of \"" + t + "\" is not supported");
}), o = (e, t) => () => (e && (t = e(e = 0)), t), s = (e, n) => {
	for (var r in n) t(e, r, {
		get: n[r],
		enumerable: !0
	});
}, c = (e, a, o, s) => {
	if (a && typeof a == "object" || typeof a == "function") for (let c of r(a)) !i.call(e, c) && c !== o && t(e, c, {
		get: () => a[c],
		enumerable: !(s = n(a, c)) || s.enumerable
	});
	return e;
}, l = (e) => c(t({}, "__esModule", { value: !0 }), e), u, d, f, p, m, h = o(() => {
	u = /* @__PURE__ */ new Map(), d = [], f = (e, t, n) => {
		if (t && typeof t.init == "function" && typeof t.createInferenceSessionHandler == "function") {
			let r = u.get(e);
			if (r === void 0) u.set(e, {
				backend: t,
				priority: n
			});
			else {
				if (r.priority > n) return;
				if (r.priority === n && r.backend !== t) throw Error(`cannot register backend "${e}" using priority ${n}`);
			}
			if (n >= 0) {
				let t = d.indexOf(e);
				t !== -1 && d.splice(t, 1);
				for (let t = 0; t < d.length; t++) if (u.get(d[t]).priority <= n) {
					d.splice(t, 0, e);
					return;
				}
				d.push(e);
			}
			return;
		}
		throw TypeError("not a valid backend");
	}, p = async (e) => {
		let t = u.get(e);
		if (!t) return "backend not found.";
		if (t.initialized) return t.backend;
		if (t.aborted) return t.error;
		{
			let n = !!t.initPromise;
			try {
				return n || (t.initPromise = t.backend.init(e)), await t.initPromise, t.initialized = !0, t.backend;
			} catch (e) {
				return n || (t.error = `${e}`, t.aborted = !0), t.error;
			} finally {
				delete t.initPromise;
			}
		}
	}, m = async (e) => {
		let t = e.executionProviders || [], n = t.map((e) => typeof e == "string" ? e : e.name), r = n.length === 0 ? d : n, i, a = [], o = /* @__PURE__ */ new Set();
		for (let e of r) {
			let t = await p(e);
			typeof t == "string" ? a.push({
				name: e,
				err: t
			}) : (i ||= t, i === t && o.add(e));
		}
		if (!i) throw Error(`no available backend found. ERR: ${a.map((e) => `[${e.name}] ${e.err}`).join(", ")}`);
		for (let { name: e, err: t } of a) n.includes(e) && console.warn(`removing requested execution provider "${e}" from session options because it is not available: ${t}`);
		let s = t.filter((e) => o.has(typeof e == "string" ? e : e.name));
		return [i, new Proxy(e, { get: (e, t) => t === "executionProviders" ? s : Reflect.get(e, t) })];
	};
}), g = o(() => {
	h();
}), _, v = o(() => {
	_ = "1.24.3";
}), y, b, ee = o(() => {
	v(), y = "warning", b = {
		wasm: {},
		webgl: {},
		webgpu: {},
		versions: { common: _ },
		set logLevel(e) {
			if (e !== void 0) {
				if (typeof e != "string" || [
					"verbose",
					"info",
					"warning",
					"error",
					"fatal"
				].indexOf(e) === -1) throw Error(`Unsupported logging level: ${e}`);
				y = e;
			}
		},
		get logLevel() {
			return y;
		}
	}, Object.defineProperty(b, "logLevel", { enumerable: !0 });
}), x, te = o(() => {
	ee(), x = b;
}), ne, S, re = o(() => {
	ne = (e, t) => {
		let n = typeof document < "u" ? document.createElement("canvas") : new OffscreenCanvas(1, 1);
		n.width = e.dims[3], n.height = e.dims[2];
		let r = n.getContext("2d");
		if (r != null) {
			let i, a;
			t?.tensorLayout !== void 0 && t.tensorLayout === "NHWC" ? (i = e.dims[2], a = e.dims[3]) : (i = e.dims[3], a = e.dims[2]);
			let o = t?.format === void 0 ? "RGB" : t.format, s = t?.norm, c, l;
			s === void 0 || s.mean === void 0 ? c = [
				255,
				255,
				255,
				255
			] : typeof s.mean == "number" ? c = [
				s.mean,
				s.mean,
				s.mean,
				s.mean
			] : (c = [
				s.mean[0],
				s.mean[1],
				s.mean[2],
				0
			], s.mean[3] !== void 0 && (c[3] = s.mean[3])), s === void 0 || s.bias === void 0 ? l = [
				0,
				0,
				0,
				0
			] : typeof s.bias == "number" ? l = [
				s.bias,
				s.bias,
				s.bias,
				s.bias
			] : (l = [
				s.bias[0],
				s.bias[1],
				s.bias[2],
				0
			], s.bias[3] !== void 0 && (l[3] = s.bias[3]));
			let u = a * i, d = 0, f = u, p = u * 2, m = -1;
			o === "RGBA" ? (d = 0, f = u, p = u * 2, m = u * 3) : o === "RGB" ? (d = 0, f = u, p = u * 2) : o === "RBG" && (d = 0, p = u, f = u * 2);
			for (let t = 0; t < a; t++) for (let n = 0; n < i; n++) {
				let i = (e.data[d++] - l[0]) * c[0], a = (e.data[f++] - l[1]) * c[1], o = (e.data[p++] - l[2]) * c[2], s = m === -1 ? 255 : (e.data[m++] - l[3]) * c[3];
				r.fillStyle = "rgba(" + i + "," + a + "," + o + "," + s + ")", r.fillRect(n, t, 1, 1);
			}
			if ("toDataURL" in n) return n.toDataURL();
			throw Error("toDataURL is not supported");
		} else throw Error("Can not access image data");
	}, S = (e, t) => {
		let n = typeof document < "u" ? document.createElement("canvas").getContext("2d") : new OffscreenCanvas(1, 1).getContext("2d"), r;
		if (n != null) {
			let i, a, o;
			t?.tensorLayout !== void 0 && t.tensorLayout === "NHWC" ? (i = e.dims[2], a = e.dims[1], o = e.dims[3]) : (i = e.dims[3], a = e.dims[2], o = e.dims[1]);
			let s = t !== void 0 && t.format !== void 0 ? t.format : "RGB", c = t?.norm, l, u;
			c === void 0 || c.mean === void 0 ? l = [
				255,
				255,
				255,
				255
			] : typeof c.mean == "number" ? l = [
				c.mean,
				c.mean,
				c.mean,
				c.mean
			] : (l = [
				c.mean[0],
				c.mean[1],
				c.mean[2],
				255
			], c.mean[3] !== void 0 && (l[3] = c.mean[3])), c === void 0 || c.bias === void 0 ? u = [
				0,
				0,
				0,
				0
			] : typeof c.bias == "number" ? u = [
				c.bias,
				c.bias,
				c.bias,
				c.bias
			] : (u = [
				c.bias[0],
				c.bias[1],
				c.bias[2],
				0
			], c.bias[3] !== void 0 && (u[3] = c.bias[3]));
			let d = a * i;
			if (t !== void 0 && (t.format !== void 0 && o === 4 && t.format !== "RGBA" || o === 3 && t.format !== "RGB" && t.format !== "BGR")) throw Error("Tensor format doesn't match input tensor dims");
			let f = 0, p = 1, m = 2, h = 3, g = 0, _ = d, v = d * 2, y = -1;
			s === "RGBA" ? (g = 0, _ = d, v = d * 2, y = d * 3) : s === "RGB" ? (g = 0, _ = d, v = d * 2) : s === "RBG" && (g = 0, v = d, _ = d * 2), r = n.createImageData(i, a);
			for (let t = 0; t < a * i; f += 4, p += 4, m += 4, h += 4, t++) r.data[f] = (e.data[g++] - u[0]) * l[0], r.data[p] = (e.data[_++] - u[1]) * l[1], r.data[m] = (e.data[v++] - u[2]) * l[2], r.data[h] = y === -1 ? 255 : (e.data[y++] - u[3]) * l[3];
		} else throw Error("Can not access image data");
		return r;
	};
}), C, ie, ae, oe, se, ce, le = o(() => {
	ge(), C = (e, t) => {
		if (e === void 0) throw Error("Image buffer must be defined");
		if (t.height === void 0 || t.width === void 0) throw Error("Image height and width must be defined");
		if (t.tensorLayout === "NHWC") throw Error("NHWC Tensor layout is not supported yet");
		let { height: n, width: r } = t, i = t.norm ?? {
			mean: 255,
			bias: 0
		}, a, o;
		a = typeof i.mean == "number" ? [
			i.mean,
			i.mean,
			i.mean,
			i.mean
		] : [
			i.mean[0],
			i.mean[1],
			i.mean[2],
			i.mean[3] ?? 255
		], o = typeof i.bias == "number" ? [
			i.bias,
			i.bias,
			i.bias,
			i.bias
		] : [
			i.bias[0],
			i.bias[1],
			i.bias[2],
			i.bias[3] ?? 0
		];
		let s = t.format === void 0 ? "RGBA" : t.format, c = t.tensorFormat !== void 0 && t.tensorFormat !== void 0 ? t.tensorFormat : "RGB", l = n * r, u = c === "RGBA" ? new Float32Array(l * 4) : new Float32Array(l * 3), d = 4, f = 0, p = 1, m = 2, h = 3, g = 0, _ = l, v = l * 2, y = -1;
		s === "RGB" && (d = 3, f = 0, p = 1, m = 2, h = -1), c === "RGBA" ? y = l * 3 : c === "RBG" ? (g = 0, v = l, _ = l * 2) : c === "BGR" && (v = 0, _ = l, g = l * 2);
		for (let t = 0; t < l; t++, f += d, m += d, p += d, h += d) u[g++] = (e[f] + o[0]) / a[0], u[_++] = (e[p] + o[1]) / a[1], u[v++] = (e[m] + o[2]) / a[2], y !== -1 && h !== -1 && (u[y++] = (e[h] + o[3]) / a[3]);
		return c === "RGBA" ? new E("float32", u, [
			1,
			4,
			n,
			r
		]) : new E("float32", u, [
			1,
			3,
			n,
			r
		]);
	}, ie = async (e, t) => {
		let n = typeof HTMLImageElement < "u" && e instanceof HTMLImageElement, r = typeof ImageData < "u" && e instanceof ImageData, i = typeof ImageBitmap < "u" && e instanceof ImageBitmap, a = typeof e == "string", o, s = t ?? {}, c = () => {
			if (typeof document < "u") return document.createElement("canvas");
			if (typeof OffscreenCanvas < "u") return new OffscreenCanvas(1, 1);
			throw Error("Canvas is not supported");
		}, l = (e) => typeof HTMLCanvasElement < "u" && e instanceof HTMLCanvasElement || e instanceof OffscreenCanvas ? e.getContext("2d") : null;
		if (n) {
			let n = c();
			n.width = e.width, n.height = e.height;
			let r = l(n);
			if (r != null) {
				let n = e.height, i = e.width;
				if (t !== void 0 && t.resizedHeight !== void 0 && t.resizedWidth !== void 0 && (n = t.resizedHeight, i = t.resizedWidth), t !== void 0) {
					if (s = t, t.tensorFormat !== void 0) throw Error("Image input config format must be RGBA for HTMLImageElement");
					s.tensorFormat = "RGBA", s.height = n, s.width = i;
				} else s.tensorFormat = "RGBA", s.height = n, s.width = i;
				r.drawImage(e, 0, 0), o = r.getImageData(0, 0, i, n).data;
			} else throw Error("Can not access image data");
		} else if (r) {
			let n, r;
			if (t !== void 0 && t.resizedWidth !== void 0 && t.resizedHeight !== void 0 ? (n = t.resizedHeight, r = t.resizedWidth) : (n = e.height, r = e.width), t !== void 0 && (s = t), s.format = "RGBA", s.height = n, s.width = r, t !== void 0) {
				let t = c();
				t.width = r, t.height = n;
				let i = l(t);
				if (i != null) i.putImageData(e, 0, 0), o = i.getImageData(0, 0, r, n).data;
				else throw Error("Can not access image data");
			} else o = e.data;
		} else if (i) {
			if (t === void 0) throw Error("Please provide image config with format for Imagebitmap");
			let n = c();
			n.width = e.width, n.height = e.height;
			let r = l(n);
			if (r != null) {
				let t = e.height, n = e.width;
				return r.drawImage(e, 0, 0, n, t), o = r.getImageData(0, 0, n, t).data, s.height = t, s.width = n, C(o, s);
			} else throw Error("Can not access image data");
		} else {
			if (a) return new Promise((t, n) => {
				let r = c(), i = l(r);
				if (!e || !i) return n();
				let a = new Image();
				a.crossOrigin = "Anonymous", a.src = e, a.onload = () => {
					r.width = a.width, r.height = a.height, i.drawImage(a, 0, 0, r.width, r.height);
					let e = i.getImageData(0, 0, r.width, r.height);
					s.height = r.height, s.width = r.width, t(C(e.data, s));
				};
			});
			throw Error("Input data provided is not supported - aborted tensor creation");
		}
		if (o !== void 0) return C(o, s);
		throw Error("Input data provided is not supported - aborted tensor creation");
	}, ae = (e, t) => {
		let { width: n, height: r, download: i, dispose: a } = t;
		return new E({
			location: "texture",
			type: "float32",
			texture: e,
			dims: [
				1,
				r,
				n,
				4
			],
			download: i,
			dispose: a
		});
	}, oe = (e, t) => {
		let { dataType: n, dims: r, download: i, dispose: a } = t;
		return new E({
			location: "gpu-buffer",
			type: n ?? "float32",
			gpuBuffer: e,
			dims: r,
			download: i,
			dispose: a
		});
	}, se = (e, t) => {
		let { dataType: n, dims: r, download: i, dispose: a } = t;
		return new E({
			location: "ml-tensor",
			type: n ?? "float32",
			mlTensor: e,
			dims: r,
			download: i,
			dispose: a
		});
	}, ce = (e, t, n) => new E({
		location: "cpu-pinned",
		type: e,
		data: t,
		dims: n ?? [t.length]
	});
}), w, T, ue, de, fe = o(() => {
	w = new Map([
		["float32", Float32Array],
		["uint8", Uint8Array],
		["int8", Int8Array],
		["uint16", Uint16Array],
		["int16", Int16Array],
		["int32", Int32Array],
		["bool", Uint8Array],
		["float64", Float64Array],
		["uint32", Uint32Array],
		["int4", Uint8Array],
		["uint4", Uint8Array]
	]), T = new Map([
		[Float32Array, "float32"],
		[Uint8Array, "uint8"],
		[Int8Array, "int8"],
		[Uint16Array, "uint16"],
		[Int16Array, "int16"],
		[Int32Array, "int32"],
		[Float64Array, "float64"],
		[Uint32Array, "uint32"]
	]), ue = !1, de = () => {
		if (!ue) {
			ue = !0;
			let e = typeof BigInt64Array < "u" && BigInt64Array.from, t = typeof BigUint64Array < "u" && BigUint64Array.from, n = globalThis.Float16Array, r = typeof n < "u" && n.from;
			e && (w.set("int64", BigInt64Array), T.set(BigInt64Array, "int64")), t && (w.set("uint64", BigUint64Array), T.set(BigUint64Array, "uint64")), r ? (w.set("float16", n), T.set(n, "float16")) : w.set("float16", Uint16Array);
		}
	};
}), pe, me, he = o(() => {
	ge(), pe = (e) => {
		let t = 1;
		for (let n = 0; n < e.length; n++) {
			let r = e[n];
			if (typeof r != "number" || !Number.isSafeInteger(r)) throw TypeError(`dims[${n}] must be an integer, got: ${r}`);
			if (r < 0) throw RangeError(`dims[${n}] must be a non-negative integer, got: ${r}`);
			t *= r;
		}
		return t;
	}, me = (e, t) => {
		switch (e.location) {
			case "cpu": return new E(e.type, e.data, t);
			case "cpu-pinned": return new E({
				location: "cpu-pinned",
				data: e.data,
				type: e.type,
				dims: t
			});
			case "texture": return new E({
				location: "texture",
				texture: e.texture,
				type: e.type,
				dims: t
			});
			case "gpu-buffer": return new E({
				location: "gpu-buffer",
				gpuBuffer: e.gpuBuffer,
				type: e.type,
				dims: t
			});
			case "ml-tensor": return new E({
				location: "ml-tensor",
				mlTensor: e.mlTensor,
				type: e.type,
				dims: t
			});
			default: throw Error(`tensorReshape: tensor location ${e.location} is not supported`);
		}
	};
}), E, ge = o(() => {
	re(), le(), fe(), he(), E = class {
		constructor(e, t, n) {
			de();
			let r, i;
			if (typeof e == "object" && "location" in e) switch (this.dataLocation = e.location, r = e.type, i = e.dims, e.location) {
				case "cpu-pinned": {
					let t = w.get(r);
					if (!t) throw TypeError(`unsupported type "${r}" to create tensor from pinned buffer`);
					if (!(e.data instanceof t)) throw TypeError(`buffer should be of type ${t.name}`);
					this.cpuData = e.data;
					break;
				}
				case "texture":
					if (r !== "float32") throw TypeError(`unsupported type "${r}" to create tensor from texture`);
					this.gpuTextureData = e.texture, this.downloader = e.download, this.disposer = e.dispose;
					break;
				case "gpu-buffer":
					if (r !== "float32" && r !== "float16" && r !== "int32" && r !== "int64" && r !== "uint32" && r !== "uint8" && r !== "bool" && r !== "uint4" && r !== "int4") throw TypeError(`unsupported type "${r}" to create tensor from gpu buffer`);
					this.gpuBufferData = e.gpuBuffer, this.downloader = e.download, this.disposer = e.dispose;
					break;
				case "ml-tensor":
					if (r !== "float32" && r !== "float16" && r !== "int32" && r !== "int64" && r !== "uint32" && r !== "uint64" && r !== "int8" && r !== "uint8" && r !== "bool" && r !== "uint4" && r !== "int4") throw TypeError(`unsupported type "${r}" to create tensor from MLTensor`);
					this.mlTensorData = e.mlTensor, this.downloader = e.download, this.disposer = e.dispose;
					break;
				default: throw Error(`Tensor constructor: unsupported location '${this.dataLocation}'`);
			}
			else {
				let a, o;
				if (typeof e == "string") if (r = e, o = n, e === "string") {
					if (!Array.isArray(t)) throw TypeError("A string tensor's data must be a string array.");
					a = t;
				} else {
					let n = w.get(e);
					if (n === void 0) throw TypeError(`Unsupported tensor type: ${e}.`);
					if (Array.isArray(t)) {
						if (e === "float16" && n === Uint16Array || e === "uint4" || e === "int4") throw TypeError(`Creating a ${e} tensor from number array is not supported. Please use ${n.name} as data.`);
						a = e === "uint64" || e === "int64" ? n.from(t, BigInt) : n.from(t);
					} else if (t instanceof n) a = t;
					else if (t instanceof Uint8ClampedArray) if (e === "uint8") a = Uint8Array.from(t);
					else throw TypeError("A Uint8ClampedArray tensor's data must be type of uint8");
					else if (e === "float16" && t instanceof Uint16Array && n !== Uint16Array) a = new globalThis.Float16Array(t.buffer, t.byteOffset, t.length);
					else throw TypeError(`A ${r} tensor's data must be type of ${n}`);
				}
				else if (o = t, Array.isArray(e)) {
					if (e.length === 0) throw TypeError("Tensor type cannot be inferred from an empty array.");
					let t = typeof e[0];
					if (t === "string") r = "string", a = e;
					else if (t === "boolean") r = "bool", a = Uint8Array.from(e);
					else throw TypeError(`Invalid element type of data array: ${t}.`);
				} else if (e instanceof Uint8ClampedArray) r = "uint8", a = Uint8Array.from(e);
				else {
					let t = T.get(e.constructor);
					if (t === void 0) throw TypeError(`Unsupported type for tensor data: ${e.constructor}.`);
					r = t, a = e;
				}
				if (o === void 0) o = [a.length];
				else if (!Array.isArray(o)) throw TypeError("A tensor's dims must be a number array");
				i = o, this.cpuData = a, this.dataLocation = "cpu";
			}
			let a = pe(i);
			if (this.cpuData && a !== this.cpuData.length && !((r === "uint4" || r === "int4") && Math.ceil(a / 2) === this.cpuData.length)) throw Error(`Tensor's size(${a}) does not match data length(${this.cpuData.length}).`);
			this.type = r, this.dims = i, this.size = a;
		}
		static async fromImage(e, t) {
			return ie(e, t);
		}
		static fromTexture(e, t) {
			return ae(e, t);
		}
		static fromGpuBuffer(e, t) {
			return oe(e, t);
		}
		static fromMLTensor(e, t) {
			return se(e, t);
		}
		static fromPinnedBuffer(e, t, n) {
			return ce(e, t, n);
		}
		toDataURL(e) {
			return ne(this, e);
		}
		toImageData(e) {
			return S(this, e);
		}
		get data() {
			if (this.ensureValid(), !this.cpuData) throw Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");
			return this.cpuData;
		}
		get location() {
			return this.dataLocation;
		}
		get texture() {
			if (this.ensureValid(), !this.gpuTextureData) throw Error("The data is not stored as a WebGL texture.");
			return this.gpuTextureData;
		}
		get gpuBuffer() {
			if (this.ensureValid(), !this.gpuBufferData) throw Error("The data is not stored as a WebGPU buffer.");
			return this.gpuBufferData;
		}
		get mlTensor() {
			if (this.ensureValid(), !this.mlTensorData) throw Error("The data is not stored as a WebNN MLTensor.");
			return this.mlTensorData;
		}
		async getData(e) {
			switch (this.ensureValid(), this.dataLocation) {
				case "cpu":
				case "cpu-pinned": return this.data;
				case "texture":
				case "gpu-buffer":
				case "ml-tensor":
					if (!this.downloader) throw Error("The current tensor is not created with a specified data downloader.");
					if (this.isDownloading) throw Error("The current tensor is being downloaded.");
					try {
						this.isDownloading = !0;
						let t = await this.downloader();
						return this.downloader = void 0, this.dataLocation = "cpu", this.cpuData = t, e && this.disposer && (this.disposer(), this.disposer = void 0), t;
					} finally {
						this.isDownloading = !1;
					}
				default: throw Error(`cannot get data from location: ${this.dataLocation}`);
			}
		}
		dispose() {
			if (this.isDownloading) throw Error("The current tensor is being downloaded.");
			this.disposer &&= (this.disposer(), void 0), this.cpuData = void 0, this.gpuTextureData = void 0, this.gpuBufferData = void 0, this.mlTensorData = void 0, this.downloader = void 0, this.isDownloading = void 0, this.dataLocation = "none";
		}
		ensureValid() {
			if (this.dataLocation === "none") throw Error("The tensor is disposed.");
		}
		reshape(e) {
			if (this.ensureValid(), this.downloader || this.disposer) throw Error("Cannot reshape a tensor that owns GPU resource.");
			return me(this, e);
		}
	};
}), D, _e = o(() => {
	ge(), D = E;
}), ve, ye, O, k, A, j, be = o(() => {
	ee(), ve = (e, t) => {
		(typeof b.trace > "u" ? !b.wasm.trace : !b.trace) || console.timeStamp(`${e}::ORT::${t}`);
	}, ye = (e, t) => {
		let n = (/* @__PURE__ */ Error()).stack?.split(/\r\n|\r|\n/g) || [], r = !1;
		for (let i = 0; i < n.length; i++) {
			if (r && !n[i].includes("TRACE_FUNC")) {
				let r = `FUNC_${e}::${n[i].trim().split(" ")[1]}`;
				t && (r += `::${t}`), ve("CPU", r);
				return;
			}
			n[i].includes("TRACE_FUNC") && (r = !0);
		}
	}, O = (e) => {
		(typeof b.trace > "u" ? !b.wasm.trace : !b.trace) || ye("BEGIN", e);
	}, k = (e) => {
		(typeof b.trace > "u" ? !b.wasm.trace : !b.trace) || ye("END", e);
	}, A = (e) => {
		(typeof b.trace > "u" ? !b.wasm.trace : !b.trace) || console.time(`ORT::${e}`);
	}, j = (e) => {
		(typeof b.trace > "u" ? !b.wasm.trace : !b.trace) || console.timeEnd(`ORT::${e}`);
	};
}), xe, Se = o(() => {
	h(), _e(), be(), xe = class e {
		constructor(e) {
			this.handler = e;
		}
		async run(e, t, n) {
			O(), A("InferenceSession.run");
			let r = {}, i = {};
			if (typeof e != "object" || !e || e instanceof D || Array.isArray(e)) throw TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");
			let a = !0;
			if (typeof t == "object") {
				if (t === null) throw TypeError("Unexpected argument[1]: cannot be null.");
				if (t instanceof D) throw TypeError("'fetches' cannot be a Tensor");
				if (Array.isArray(t)) {
					if (t.length === 0) throw TypeError("'fetches' cannot be an empty array.");
					a = !1;
					for (let e of t) {
						if (typeof e != "string") throw TypeError("'fetches' must be a string array or an object.");
						if (this.outputNames.indexOf(e) === -1) throw RangeError(`'fetches' contains invalid output name: ${e}.`);
						r[e] = null;
					}
					if (typeof n == "object" && n) i = n;
					else if (typeof n < "u") throw TypeError("'options' must be an object.");
				} else {
					let e = !1, o = Object.getOwnPropertyNames(t);
					for (let n of this.outputNames) if (o.indexOf(n) !== -1) {
						let i = t[n];
						(i === null || i instanceof D) && (e = !0, a = !1, r[n] = i);
					}
					if (e) {
						if (typeof n == "object" && n) i = n;
						else if (typeof n < "u") throw TypeError("'options' must be an object.");
					} else i = t;
				}
			} else if (typeof t < "u") throw TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");
			for (let t of this.inputNames) if (typeof e[t] > "u") throw Error(`input '${t}' is missing in 'feeds'.`);
			if (a) for (let e of this.outputNames) r[e] = null;
			let o = await this.handler.run(e, r, i), s = {};
			for (let e in o) if (Object.hasOwnProperty.call(o, e)) {
				let t = o[e];
				t instanceof D ? s[e] = t : s[e] = new D(t.type, t.data, t.dims);
			}
			return j("InferenceSession.run"), k(), s;
		}
		async release() {
			return this.handler.dispose();
		}
		static async create(t, n, r, i) {
			O(), A("InferenceSession.create");
			let a, o = {};
			if (typeof t == "string") {
				if (a = t, typeof n == "object" && n) o = n;
				else if (typeof n < "u") throw TypeError("'options' must be an object.");
			} else if (t instanceof Uint8Array) {
				if (a = t, typeof n == "object" && n) o = n;
				else if (typeof n < "u") throw TypeError("'options' must be an object.");
			} else if (t instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && t instanceof SharedArrayBuffer) {
				let e = t, s = 0, c = t.byteLength;
				if (typeof n == "object" && n) o = n;
				else if (typeof n == "number") {
					if (s = n, !Number.isSafeInteger(s)) throw RangeError("'byteOffset' must be an integer.");
					if (s < 0 || s >= e.byteLength) throw RangeError(`'byteOffset' is out of range [0, ${e.byteLength}).`);
					if (c = t.byteLength - s, typeof r == "number") {
						if (c = r, !Number.isSafeInteger(c)) throw RangeError("'byteLength' must be an integer.");
						if (c <= 0 || s + c > e.byteLength) throw RangeError(`'byteLength' is out of range (0, ${e.byteLength - s}].`);
						if (typeof i == "object" && i) o = i;
						else if (typeof i < "u") throw TypeError("'options' must be an object.");
					} else if (typeof r < "u") throw TypeError("'byteLength' must be a number.");
				} else if (typeof n < "u") throw TypeError("'options' must be an object.");
				a = new Uint8Array(e, s, c);
			} else throw TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");
			let [s, c] = await m(o), l = await s.createInferenceSessionHandler(a, c);
			return j("InferenceSession.create"), k(), new e(l);
		}
		startProfiling() {
			this.handler.startProfiling();
		}
		endProfiling() {
			this.handler.endProfiling();
		}
		get inputNames() {
			return this.handler.inputNames;
		}
		get outputNames() {
			return this.handler.outputNames;
		}
		get inputMetadata() {
			return this.handler.inputMetadata;
		}
		get outputMetadata() {
			return this.handler.outputMetadata;
		}
	};
}), Ce, we = o(() => {
	Se(), Ce = xe;
}), Te = o(() => {}), Ee = o(() => {}), De = o(() => {}), Oe = o(() => {});
s({}, {
	InferenceSession: () => Ce,
	TRACE: () => ve,
	TRACE_EVENT_BEGIN: () => A,
	TRACE_EVENT_END: () => j,
	TRACE_FUNC_BEGIN: () => O,
	TRACE_FUNC_END: () => k,
	Tensor: () => D,
	env: () => x,
	registerBackend: () => f
});
var M = o(() => {
	g(), te(), we(), _e(), Te(), Ee(), be(), De(), Oe();
}), ke = o(() => {}), Ae = {};
s(Ae, { default: () => Ne });
var je, Me, Ne, Pe = o(() => {
	Mt(), L(), Je(), je = "ort-wasm-proxy-worker", Me = globalThis.self?.name === je, Me && (self.onmessage = (e) => {
		let { type: t, in: n } = e.data;
		try {
			switch (t) {
				case "init-wasm":
					et(n.wasm).then(() => {
						xt(n).then(() => {
							postMessage({ type: t });
						}, (e) => {
							postMessage({
								type: t,
								err: e
							});
						});
					}, (e) => {
						postMessage({
							type: t,
							err: e
						});
					});
					break;
				case "init-ep": {
					let { epName: e, env: r } = n;
					St(r, e).then(() => {
						postMessage({ type: t });
					}, (e) => {
						postMessage({
							type: t,
							err: e
						});
					});
					break;
				}
				case "copy-from": {
					let { buffer: e } = n, r = Tt(e);
					postMessage({
						type: t,
						out: r
					});
					break;
				}
				case "create": {
					let { model: e, options: r } = n;
					Et(e, r).then((e) => {
						postMessage({
							type: t,
							out: e
						});
					}, (e) => {
						postMessage({
							type: t,
							err: e
						});
					});
					break;
				}
				case "release":
					Dt(n), postMessage({ type: t });
					break;
				case "run": {
					let { sessionId: e, inputIndices: r, inputs: i, outputIndices: a, options: o } = n;
					kt(e, r, i, a, Array(a.length).fill(null), o).then((e) => {
						e.some((e) => e[3] !== "cpu") ? postMessage({
							type: t,
							err: "Proxy does not support non-cpu tensor location."
						}) : postMessage({
							type: t,
							out: e
						}, jt([...i, ...e]));
					}, (e) => {
						postMessage({
							type: t,
							err: e
						});
					});
					break;
				}
				case "end-profiling":
					At(n), postMessage({ type: t });
					break;
				default:
			}
		} catch (e) {
			postMessage({
				type: t,
				err: e
			});
		}
	}), Ne = Me ? null : (e) => new Worker(e ?? N, {
		type: "module",
		name: je
	});
}), Fe, Ie, Le, N, Re, ze, Be, Ve, He, Ue, We, Ge, Ke, qe, Je = o(() => {
	ke(), Fe = typeof location > "u" ? void 0 : location.origin, Ie = import.meta.url > "file:" && import.meta.url < "file;", Le = () => Ie ? new URL(new URL("ort.wasm.min.mjs", import.meta.url).href, Fe).href : import.meta.url, N = Le(), Re = () => {
		if (N && !N.startsWith("blob:")) return N.substring(0, N.lastIndexOf("/") + 1);
	}, ze = (e, t) => {
		try {
			let n = t ?? N;
			return (n ? new URL(e, n) : new URL(e)).origin === Fe;
		} catch {
			return !1;
		}
	}, Be = (e, t) => {
		let n = t ?? N;
		try {
			return (n ? new URL(e, n) : new URL(e)).href;
		} catch {
			return;
		}
	}, Ve = (e, t) => `${t ?? "./"}${e}`, He = async (e) => {
		let t = await (await fetch(e, { credentials: "same-origin" })).blob();
		return URL.createObjectURL(t);
	}, Ue = async (e) => (await import(
		/*webpackIgnore:true*/
		/*@vite-ignore*/
		e
)).default, We = (Pe(), l(Ae)).default, Ge = async () => {
		if (!N) throw Error("Failed to load proxy worker: cannot determine the script source URL.");
		if (ze(N)) return [void 0, We()];
		let e = await He(N);
		return [e, We(e)];
	}, Ke = void 0, qe = async (e, t, n, r) => {
		let i = Ke && !(e || t);
		if (i) if (N) i = ze(N) || r && !n;
		else if (r && !n) i = !0;
		else throw Error("cannot determine the script source URL.");
		if (i) return [void 0, Ke];
		{
			let r = "ort-wasm-simd-threaded.mjs", i = e ?? Be(r, t), a = n && i && !ze(i, t), o = a ? await He(i) : i ?? Ve(r, t);
			return [a ? o : void 0, await Ue(o)];
		}
	};
}), Ye, P, F, Xe, Ze, Qe, $e, et, I, L = o(() => {
	Je(), P = !1, F = !1, Xe = !1, Ze = () => {
		if (typeof SharedArrayBuffer > "u") return !1;
		try {
			return typeof MessageChannel < "u" && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(new Uint8Array([
				0,
				97,
				115,
				109,
				1,
				0,
				0,
				0,
				1,
				4,
				1,
				96,
				0,
				0,
				3,
				2,
				1,
				0,
				5,
				4,
				1,
				3,
				1,
				1,
				10,
				11,
				1,
				9,
				0,
				65,
				0,
				254,
				16,
				2,
				0,
				26,
				11
			]));
		} catch {
			return !1;
		}
	}, Qe = () => {
		try {
			return WebAssembly.validate(new Uint8Array([
				0,
				97,
				115,
				109,
				1,
				0,
				0,
				0,
				1,
				4,
				1,
				96,
				0,
				0,
				3,
				2,
				1,
				0,
				10,
				30,
				1,
				28,
				0,
				65,
				0,
				253,
				15,
				253,
				12,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				253,
				186,
				1,
				26,
				11
			]));
		} catch {
			return !1;
		}
	}, $e = () => {
		try {
			return WebAssembly.validate(new Uint8Array([
				0,
				97,
				115,
				109,
				1,
				0,
				0,
				0,
				1,
				5,
				1,
				96,
				0,
				1,
				123,
				3,
				2,
				1,
				0,
				10,
				19,
				1,
				17,
				0,
				65,
				1,
				253,
				15,
				65,
				2,
				253,
				15,
				65,
				3,
				253,
				15,
				253,
				147,
				2,
				11
			]));
		} catch {
			return !1;
		}
	}, et = async (e) => {
		if (P) return Promise.resolve();
		if (F) throw Error("multiple calls to 'initializeWebAssembly()' detected.");
		if (Xe) throw Error("previous call to 'initializeWebAssembly()' failed.");
		F = !0;
		let t = e.initTimeout, n = e.numThreads;
		if (e.simd !== !1) {
			if (e.simd === "relaxed") {
				if (!$e()) throw Error("Relaxed WebAssembly SIMD is not supported in the current environment.");
			} else if (!Qe()) throw Error("WebAssembly SIMD is not supported in the current environment.");
		}
		let r = Ze();
		n > 1 && !r && (typeof self < "u" && !self.crossOriginIsolated && console.warn("env.wasm.numThreads is set to " + n + ", but this will not work unless you enable crossOriginIsolated mode. See https://web.dev/cross-origin-isolation-guide/ for more info."), console.warn("WebAssembly multi-threading is not supported in the current environment. Falling back to single-threading."), e.numThreads = n = 1);
		let i = e.wasmPaths, a = typeof i == "string" ? i : void 0, o = i?.mjs, s = o?.href ?? o, c = i?.wasm, l = c?.href ?? c, u = e.wasmBinary, [d, f] = await qe(s, a, n > 1, !!u || !!l), p = !1, m = [];
		if (t > 0 && m.push(new Promise((e) => {
			setTimeout(() => {
				p = !0, e();
			}, t);
		})), m.push(new Promise((e, t) => {
			let r = { numThreads: n };
			if (u) r.wasmBinary = u, r.locateFile = (e) => e;
			else if (l || a) r.locateFile = (e) => l ?? a + e;
			else if (s && s.indexOf("blob:") !== 0) r.locateFile = (e) => new URL(e, s).href;
			else if (d) {
				let e = Re();
				e && (r.locateFile = (t) => e + t);
			}
			f(r).then((t) => {
				F = !1, P = !0, Ye = t, e(), d && URL.revokeObjectURL(d);
			}, (e) => {
				F = !1, Xe = !0, t(e);
			});
		})), await Promise.race(m), p) throw Error(`WebAssembly backend initializing failed due to timeout: ${t}ms`);
	}, I = () => {
		if (P && Ye) return Ye;
		throw Error("WebAssembly is not initialized yet.");
	};
}), R, tt, z, nt = o(() => {
	L(), R = (e, t) => {
		let n = I(), r = n.lengthBytesUTF8(e) + 1, i = n._malloc(r);
		return n.stringToUTF8(e, i, r), t.push(i), i;
	}, tt = (e, t, n, r) => {
		if (typeof e == "object" && e) {
			if (n.has(e)) throw Error("Circular reference in options");
			n.add(e);
		}
		Object.entries(e).forEach(([e, i]) => {
			let a = t ? t + e : e;
			if (typeof i == "object") tt(i, a + ".", n, r);
			else if (typeof i == "string" || typeof i == "number") r(a, i.toString());
			else if (typeof i == "boolean") r(a, i ? "1" : "0");
			else throw Error(`Can't handle extra config type: ${typeof i}`);
		});
	}, z = (e) => {
		let t = I(), n = t.stackSave();
		try {
			let n = t.PTR_SIZE, r = t.stackAlloc(2 * n);
			t._OrtGetLastError(r, r + n);
			let i = Number(t.getValue(r, n === 4 ? "i32" : "i64")), a = t.getValue(r + n, "*"), o = a ? t.UTF8ToString(a) : "";
			throw Error(`${e} ERROR_CODE: ${i}, ERROR_MESSAGE: ${o}`);
		} finally {
			t.stackRestore(n);
		}
	};
}), rt, it = o(() => {
	L(), nt(), rt = (e) => {
		let t = I(), n = 0, r = [], i = e || {};
		try {
			if (e?.logSeverityLevel === void 0) i.logSeverityLevel = 2;
			else if (typeof e.logSeverityLevel != "number" || !Number.isInteger(e.logSeverityLevel) || e.logSeverityLevel < 0 || e.logSeverityLevel > 4) throw Error(`log severity level is not valid: ${e.logSeverityLevel}`);
			if (e?.logVerbosityLevel === void 0) i.logVerbosityLevel = 0;
			else if (typeof e.logVerbosityLevel != "number" || !Number.isInteger(e.logVerbosityLevel)) throw Error(`log verbosity level is not valid: ${e.logVerbosityLevel}`);
			e?.terminate === void 0 && (i.terminate = !1);
			let a = 0;
			return e?.tag !== void 0 && (a = R(e.tag, r)), n = t._OrtCreateRunOptions(i.logSeverityLevel, i.logVerbosityLevel, !!i.terminate, a), n === 0 && z("Can't create run options."), e?.extra !== void 0 && tt(e.extra, "", /* @__PURE__ */ new WeakSet(), (e, i) => {
				let a = R(e, r), o = R(i, r);
				t._OrtAddRunConfigEntry(n, a, o) !== 0 && z(`Can't set a run config entry: ${e} - ${i}.`);
			}), [n, r];
		} catch (e) {
			throw n !== 0 && t._OrtReleaseRunOptions(n), r.forEach((e) => t._free(e)), e;
		}
	};
}), at, ot, st, B, ct, lt, ut = o(() => {
	L(), nt(), at = (e) => {
		switch (e) {
			case "disabled": return 0;
			case "basic": return 1;
			case "extended": return 2;
			case "layout": return 3;
			case "all": return 99;
			default: throw Error(`unsupported graph optimization level: ${e}`);
		}
	}, ot = (e) => {
		switch (e) {
			case "sequential": return 0;
			case "parallel": return 1;
			default: throw Error(`unsupported execution mode: ${e}`);
		}
	}, st = (e) => {
		e.extra ||= {}, e.extra.session || (e.extra.session = {});
		let t = e.extra.session;
		t.use_ort_model_bytes_directly ||= "1", e.executionProviders && e.executionProviders.some((e) => (typeof e == "string" ? e : e.name) === "webgpu") && (e.enableMemPattern = !1);
	}, B = (e, t, n, r) => {
		let i = R(t, r), a = R(n, r);
		I()._OrtAddSessionConfigEntry(e, i, a) !== 0 && z(`Can't set a session config entry: ${t} - ${n}.`);
	}, ct = async (e, t, n) => {
		let r = t.executionProviders;
		for (let t of r) {
			let r = typeof t == "string" ? t : t.name, i = [];
			switch (r) {
				case "webnn":
					if (r = "WEBNN", typeof t != "string") {
						let r = t?.deviceType;
						r && B(e, "deviceType", r, n);
					}
					break;
				case "webgpu":
					if (r = "JS", typeof t != "string") {
						let r = t;
						if (r?.preferredLayout) {
							if (r.preferredLayout !== "NCHW" && r.preferredLayout !== "NHWC") throw Error(`preferredLayout must be either 'NCHW' or 'NHWC': ${r.preferredLayout}`);
							B(e, "preferredLayout", r.preferredLayout, n);
						}
					}
					break;
				case "wasm":
				case "cpu": continue;
				default: throw Error(`not supported execution provider: ${r}`);
			}
			let a = R(r, n), o = i.length, s = 0, c = 0;
			if (o > 0) {
				s = I()._malloc(o * I().PTR_SIZE), n.push(s), c = I()._malloc(o * I().PTR_SIZE), n.push(c);
				for (let e = 0; e < o; e++) I().setValue(s + e * I().PTR_SIZE, i[e][0], "*"), I().setValue(c + e * I().PTR_SIZE, i[e][1], "*");
			}
			await I()._OrtAppendExecutionProvider(e, a, s, c, o) !== 0 && z(`Can't append execution provider: ${r}.`);
		}
	}, lt = async (e) => {
		let t = I(), n = 0, r = [], i = e || {};
		st(i);
		try {
			let e = at(i.graphOptimizationLevel ?? "all"), a = ot(i.executionMode ?? "sequential"), o = typeof i.logId == "string" ? R(i.logId, r) : 0, s = i.logSeverityLevel ?? 2;
			if (!Number.isInteger(s) || s < 0 || s > 4) throw Error(`log severity level is not valid: ${s}`);
			let c = i.logVerbosityLevel ?? 0;
			if (!Number.isInteger(c) || c < 0 || c > 4) throw Error(`log verbosity level is not valid: ${c}`);
			let l = typeof i.optimizedModelFilePath == "string" ? R(i.optimizedModelFilePath, r) : 0;
			if (n = t._OrtCreateSessionOptions(e, !!i.enableCpuMemArena, !!i.enableMemPattern, a, !!i.enableProfiling, 0, o, s, c, l), n === 0 && z("Can't create session options."), i.executionProviders && await ct(n, i, r), i.enableGraphCapture !== void 0) {
				if (typeof i.enableGraphCapture != "boolean") throw Error(`enableGraphCapture must be a boolean value: ${i.enableGraphCapture}`);
				B(n, "enableGraphCapture", i.enableGraphCapture.toString(), r);
			}
			if (i.freeDimensionOverrides) for (let [e, a] of Object.entries(i.freeDimensionOverrides)) {
				if (typeof e != "string") throw Error(`free dimension override name must be a string: ${e}`);
				if (typeof a != "number" || !Number.isInteger(a) || a < 0) throw Error(`free dimension override value must be a non-negative integer: ${a}`);
				let i = R(e, r);
				t._OrtAddFreeDimensionOverride(n, i, a) !== 0 && z(`Can't set a free dimension override: ${e} - ${a}.`);
			}
			return i.extra !== void 0 && tt(i.extra, "", /* @__PURE__ */ new WeakSet(), (e, t) => {
				B(n, e, t, r);
			}), [n, r];
		} catch (e) {
			throw n !== 0 && t._OrtReleaseSessionOptions(n) !== 0 && z("Can't release session options."), r.forEach((e) => t._free(e)), e;
		}
	};
}), V, dt, H, ft, pt, mt, ht, gt, _t = o(() => {
	V = (e) => {
		switch (e) {
			case "int8": return 3;
			case "uint8": return 2;
			case "bool": return 9;
			case "int16": return 5;
			case "uint16": return 4;
			case "int32": return 6;
			case "uint32": return 12;
			case "float16": return 10;
			case "float32": return 1;
			case "float64": return 11;
			case "string": return 8;
			case "int64": return 7;
			case "uint64": return 13;
			case "int4": return 22;
			case "uint4": return 21;
			default: throw Error(`unsupported data type: ${e}`);
		}
	}, dt = (e) => {
		switch (e) {
			case 3: return "int8";
			case 2: return "uint8";
			case 9: return "bool";
			case 5: return "int16";
			case 4: return "uint16";
			case 6: return "int32";
			case 12: return "uint32";
			case 10: return "float16";
			case 1: return "float32";
			case 11: return "float64";
			case 8: return "string";
			case 7: return "int64";
			case 13: return "uint64";
			case 22: return "int4";
			case 21: return "uint4";
			default: throw Error(`unsupported data type: ${e}`);
		}
	}, H = (e, t) => {
		let n = [
			-1,
			4,
			1,
			1,
			2,
			2,
			4,
			8,
			-1,
			1,
			2,
			8,
			4,
			8,
			-1,
			-1,
			-1,
			-1,
			-1,
			-1,
			-1,
			.5,
			.5
		][e], r = typeof t == "number" ? t : t.reduce((e, t) => e * t, 1);
		return n > 0 ? Math.ceil(r * n) : void 0;
	}, ft = (e) => {
		switch (e) {
			case "float16": return typeof Float16Array < "u" && Float16Array.from ? Float16Array : Uint16Array;
			case "float32": return Float32Array;
			case "uint8": return Uint8Array;
			case "int8": return Int8Array;
			case "uint16": return Uint16Array;
			case "int16": return Int16Array;
			case "int32": return Int32Array;
			case "bool": return Uint8Array;
			case "float64": return Float64Array;
			case "uint32": return Uint32Array;
			case "int64": return BigInt64Array;
			case "uint64": return BigUint64Array;
			default: throw Error(`unsupported type: ${e}`);
		}
	}, pt = (e) => {
		switch (e) {
			case "verbose": return 0;
			case "info": return 1;
			case "warning": return 2;
			case "error": return 3;
			case "fatal": return 4;
			default: throw Error(`unsupported logging level: ${e}`);
		}
	}, mt = (e) => e === "float32" || e === "float16" || e === "int32" || e === "int64" || e === "uint32" || e === "uint8" || e === "bool" || e === "uint4" || e === "int4", ht = (e) => e === "float32" || e === "float16" || e === "int32" || e === "int64" || e === "uint32" || e === "uint64" || e === "int8" || e === "uint8" || e === "bool" || e === "uint4" || e === "int4", gt = (e) => {
		switch (e) {
			case "none": return 0;
			case "cpu": return 1;
			case "cpu-pinned": return 2;
			case "texture": return 3;
			case "gpu-buffer": return 4;
			case "ml-tensor": return 5;
			default: throw Error(`unsupported data location: ${e}`);
		}
	};
}), vt, yt = o(() => {
	ke(), vt = async (e) => {
		if (typeof e == "string") {
			let t = await fetch(e);
			if (!t.ok) throw Error(`failed to load external data file: ${e}`);
			let n = t.headers.get("Content-Length"), r = n ? parseInt(n, 10) : 0;
			if (r < 1073741824) return new Uint8Array(await t.arrayBuffer());
			{
				if (!t.body) throw Error(`failed to load external data file: ${e}, no response body.`);
				let n = t.body.getReader(), i;
				try {
					i = new ArrayBuffer(r);
				} catch (e) {
					if (e instanceof RangeError) {
						let e = Math.ceil(r / 65536);
						i = new WebAssembly.Memory({
							initial: e,
							maximum: e
						}).buffer;
					} else throw e;
				}
				let a = 0;
				for (;;) {
					let { done: e, value: t } = await n.read();
					if (e) break;
					let r = t.byteLength;
					new Uint8Array(i, a, r).set(t), a += r;
				}
				return new Uint8Array(i, 0, r);
			}
		} else return e instanceof Blob ? new Uint8Array(await e.arrayBuffer()) : e instanceof Uint8Array ? e : new Uint8Array(e);
	};
}), bt, xt, St, U, Ct, wt, Tt, Et, Dt, Ot, kt, At, jt, Mt = o(() => {
	M(), it(), ut(), _t(), L(), nt(), yt(), bt = (e, t) => {
		I()._OrtInit(e, t) !== 0 && z("Can't initialize onnxruntime.");
	}, xt = async (e) => {
		bt(e.wasm.numThreads, pt(e.logLevel));
	}, St = async (e, t) => {
		I().asyncInit?.();
		let n = e.webgpu.adapter;
		if (t === "webgpu") {
			if (typeof navigator > "u" || !navigator.gpu) throw Error("WebGPU is not supported in current environment");
			if (n) {
				if (typeof n.limits != "object" || typeof n.features != "object" || typeof n.requestDevice != "function") throw Error("Invalid GPU adapter set in `env.webgpu.adapter`. It must be a GPUAdapter object.");
			} else {
				let t = e.webgpu.powerPreference;
				if (t !== void 0 && t !== "low-power" && t !== "high-performance") throw Error(`Invalid powerPreference setting: "${t}"`);
				let r = e.webgpu.forceFallbackAdapter;
				if (r !== void 0 && typeof r != "boolean") throw Error(`Invalid forceFallbackAdapter setting: "${r}"`);
				if (n = await navigator.gpu.requestAdapter({
					powerPreference: t,
					forceFallbackAdapter: r
				}), !n) throw Error("Failed to get GPU adapter. You may need to enable flag \"--enable-unsafe-webgpu\" if you are using Chrome.");
			}
		}
		if (t === "webnn" && (typeof navigator > "u" || !navigator.ml)) throw Error("WebNN is not supported in current environment");
	}, U = /* @__PURE__ */ new Map(), Ct = (e) => {
		let t = I(), n = t.stackSave();
		try {
			let n = t.PTR_SIZE, r = t.stackAlloc(2 * n);
			t._OrtGetInputOutputCount(e, r, r + n) !== 0 && z("Can't get session input/output count.");
			let i = n === 4 ? "i32" : "i64";
			return [Number(t.getValue(r, i)), Number(t.getValue(r + n, i))];
		} finally {
			t.stackRestore(n);
		}
	}, wt = (e, t) => {
		let n = I(), r = n.stackSave(), i = 0;
		try {
			let r = n.PTR_SIZE, a = n.stackAlloc(2 * r);
			n._OrtGetInputOutputMetadata(e, t, a, a + r) !== 0 && z("Can't get session input/output metadata.");
			let o = Number(n.getValue(a, "*"));
			i = Number(n.getValue(a + r, "*"));
			let s = n.HEAP32[i / 4];
			if (s === 0) return [o, 0];
			let c = n.HEAPU32[i / 4 + 1], l = [];
			for (let e = 0; e < c; e++) {
				let t = Number(n.getValue(i + 8 + e * r, "*"));
				l.push(t === 0 ? Number(n.getValue(i + 8 + (e + c) * r, "*")) : n.UTF8ToString(t));
			}
			return [
				o,
				s,
				l
			];
		} finally {
			n.stackRestore(r), i !== 0 && n._OrtFree(i);
		}
	}, Tt = (e) => {
		let t = I(), n = t._malloc(e.byteLength);
		if (n === 0) throw Error(`Can't create a session. failed to allocate a buffer of size ${e.byteLength}.`);
		return t.HEAPU8.set(e, n), [n, e.byteLength];
	}, Et = async (e, t) => {
		let n, r, i = I();
		Array.isArray(e) ? [n, r] = e : e.buffer === i.HEAPU8.buffer ? [n, r] = [e.byteOffset, e.byteLength] : [n, r] = Tt(e);
		let a = 0, o = 0, s = [], c = [], l = [];
		try {
			if ([o, s] = await lt(t), t?.externalData && i.mountExternalData) {
				let e = [];
				for (let n of t.externalData) {
					let t = typeof n == "string" ? n : n.path;
					e.push(vt(typeof n == "string" ? n : n.data).then((e) => {
						i.mountExternalData(t, e);
					}));
				}
				await Promise.all(e);
			}
			for (let e of t?.executionProviders ?? []) if ((typeof e == "string" ? e : e.name) === "webnn") {
				if (i.shouldTransferToMLTensor = !1, typeof e != "string") {
					let t = e, n = t?.context, r = t?.gpuDevice, a = t?.deviceType, o = t?.powerPreference;
					n ? i.currentContext = n : r ? i.currentContext = await i.webnnCreateMLContext(r) : i.currentContext = await i.webnnCreateMLContext({
						deviceType: a,
						powerPreference: o
					});
				} else i.currentContext = await i.webnnCreateMLContext();
				break;
			}
			a = await i._OrtCreateSession(n, r, o), i.webgpuOnCreateSession?.(a), a === 0 && z("Can't create a session."), i.jsepOnCreateSession?.(), i.currentContext && (i.webnnRegisterMLContext(a, i.currentContext), i.currentContext = void 0, i.shouldTransferToMLTensor = !0);
			let [e, u] = Ct(a), d = !!t?.enableGraphCapture, f = [], p = [], m = [], h = [];
			for (let t = 0; t < e; t++) {
				let [e, n, r] = wt(a, t);
				e === 0 && z("Can't get an input name."), c.push(e);
				let o = i.UTF8ToString(e);
				f.push(o), m.push(n === 0 ? {
					name: o,
					isTensor: !1
				} : {
					name: o,
					isTensor: !0,
					type: dt(n),
					shape: r
				});
			}
			for (let t = 0; t < u; t++) {
				let [n, r, o] = wt(a, t + e);
				n === 0 && z("Can't get an output name."), l.push(n);
				let s = i.UTF8ToString(n);
				p.push(s), h.push(r === 0 ? {
					name: s,
					isTensor: !1
				} : {
					name: s,
					isTensor: !0,
					type: dt(r),
					shape: o
				});
			}
			return U.set(a, [
				a,
				c,
				l,
				null,
				d,
				!1
			]), [
				a,
				f,
				p,
				m,
				h
			];
		} catch (e) {
			throw c.forEach((e) => i._OrtFree(e)), l.forEach((e) => i._OrtFree(e)), a !== 0 && i._OrtReleaseSession(a) !== 0 && z("Can't release session."), e;
		} finally {
			i._free(n), o !== 0 && i._OrtReleaseSessionOptions(o) !== 0 && z("Can't release session options."), s.forEach((e) => i._free(e)), i.unmountExternalData?.();
		}
	}, Dt = (e) => {
		let t = I(), n = U.get(e);
		if (!n) throw Error(`cannot release session. invalid session id: ${e}`);
		let [r, i, a, o, s] = n;
		o && (s && t._OrtClearBoundOutputs(o.handle) !== 0 && z("Can't clear bound outputs."), t._OrtReleaseBinding(o.handle) !== 0 && z("Can't release IO binding.")), t.jsepOnReleaseSession?.(e), t.webnnOnReleaseSession?.(e), t.webgpuOnReleaseSession?.(e), i.forEach((e) => t._OrtFree(e)), a.forEach((e) => t._OrtFree(e)), t._OrtReleaseSession(r) !== 0 && z("Can't release session."), U.delete(e);
	}, Ot = async (e, t, n, r, i, a, o = !1) => {
		if (!e) {
			t.push(0);
			return;
		}
		let s = I(), c = s.PTR_SIZE, l = e[0], u = e[1], d = e[3], f = d, p, m;
		if (l === "string" && (d === "gpu-buffer" || d === "ml-tensor")) throw Error("String tensor is not supported on GPU.");
		if (o && d !== "gpu-buffer") throw Error(`External buffer must be provided for input/output index ${a} when enableGraphCapture is true.`);
		if (d === "gpu-buffer") {
			let t = e[2].gpuBuffer;
			m = H(V(l), u);
			{
				let e = s.jsepRegisterBuffer;
				if (!e) throw Error("Tensor location \"gpu-buffer\" is not supported without using WebGPU.");
				p = e(r, a, t, m);
			}
		} else if (d === "ml-tensor") {
			let t = e[2].mlTensor;
			m = H(V(l), u);
			let n = s.webnnRegisterMLTensor;
			if (!n) throw Error("Tensor location \"ml-tensor\" is not supported without using WebNN.");
			p = n(r, t, V(l), u);
		} else {
			let t = e[2];
			if (Array.isArray(t)) {
				m = c * t.length, p = s._malloc(m), n.push(p);
				for (let e = 0; e < t.length; e++) {
					if (typeof t[e] != "string") throw TypeError(`tensor data at index ${e} is not a string`);
					s.setValue(p + e * c, R(t[e], n), "*");
				}
			} else {
				let e = s.webnnIsGraphInput, a = s.webnnIsGraphOutput;
				if (l !== "string" && e && a) {
					let o = s.UTF8ToString(i);
					if (e(r, o) || a(r, o)) {
						let e = V(l);
						m = H(e, u), f = "ml-tensor";
						let n = s.webnnCreateTemporaryTensor, i = s.webnnUploadTensor;
						if (!n || !i) throw Error("Tensor location \"ml-tensor\" is not supported without using WebNN.");
						let a = await n(r, e, u);
						i(a, new Uint8Array(t.buffer, t.byteOffset, t.byteLength)), p = a;
					} else m = t.byteLength, p = s._malloc(m), n.push(p), s.HEAPU8.set(new Uint8Array(t.buffer, t.byteOffset, m), p);
				} else m = t.byteLength, p = s._malloc(m), n.push(p), s.HEAPU8.set(new Uint8Array(t.buffer, t.byteOffset, m), p);
			}
		}
		let h = s.stackSave(), g = s.stackAlloc(4 * u.length);
		try {
			u.forEach((e, t) => s.setValue(g + t * c, e, c === 4 ? "i32" : "i64"));
			let e = s._OrtCreateTensor(V(l), p, m, g, u.length, gt(f));
			e === 0 && z(`Can't create tensor for input/output. session=${r}, index=${a}.`), t.push(e);
		} finally {
			s.stackRestore(h);
		}
	}, kt = async (e, t, n, r, i, a) => {
		let o = I(), s = o.PTR_SIZE, c = U.get(e);
		if (!c) throw Error(`cannot run inference. invalid session id: ${e}`);
		let l = c[0], u = c[1], d = c[2], f = c[3], p = c[4];
		c[5];
		let m = t.length, h = r.length, g = 0, _ = [], v = [], y = [], b = [], ee = [], x = o.stackSave(), te = o.stackAlloc(m * s), ne = o.stackAlloc(m * s), S = o.stackAlloc(h * s), re = o.stackAlloc(h * s);
		try {
			[g, _] = rt(a), A("wasm prepareInputOutputTensor");
			for (let r = 0; r < m; r++) await Ot(n[r], v, b, e, u[t[r]], t[r], p);
			for (let t = 0; t < h; t++) await Ot(i[t], y, b, e, d[r[t]], m + r[t], p);
			j("wasm prepareInputOutputTensor");
			for (let e = 0; e < m; e++) o.setValue(te + e * s, v[e], "*"), o.setValue(ne + e * s, u[t[e]], "*");
			for (let e = 0; e < h; e++) o.setValue(S + e * s, y[e], "*"), o.setValue(re + e * s, d[r[e]], "*");
			o.jsepOnRunStart?.(l), o.webnnOnRunStart?.(l);
			let c;
			c = await o._OrtRun(l, ne, te, m, re, h, S, g), c !== 0 && z("failed to call OrtRun().");
			let x = [], C = [];
			A("wasm ProcessOutputTensor");
			for (let t = 0; t < h; t++) {
				let n = Number(o.getValue(S + t * s, "*"));
				if (n === y[t] || ee.includes(y[t])) {
					x.push(i[t]), n !== y[t] && o._OrtReleaseTensor(n) !== 0 && z("Can't release tensor.");
					continue;
				}
				let a = o.stackSave(), c = o.stackAlloc(4 * s), l = !1, u, d = 0;
				try {
					o._OrtGetTensorData(n, c, c + s, c + 2 * s, c + 3 * s) !== 0 && z(`Can't access output tensor data on index ${t}.`);
					let i = s === 4 ? "i32" : "i64", a = Number(o.getValue(c, i));
					d = o.getValue(c + s, "*");
					let p = o.getValue(c + s * 2, "*"), m = Number(o.getValue(c + s * 3, i)), h = [];
					for (let e = 0; e < m; e++) h.push(Number(o.getValue(p + e * s, i)));
					o._OrtFree(p) !== 0 && z("Can't free memory for tensor dims.");
					let g = h.reduce((e, t) => e * t, 1);
					u = dt(a);
					let _ = f?.outputPreferredLocations[r[t]];
					if (u === "string") {
						if (_ === "gpu-buffer" || _ === "ml-tensor") throw Error("String tensor is not supported on GPU.");
						let e = [];
						for (let t = 0; t < g; t++) {
							let n = o.getValue(d + t * s, "*"), r = o.getValue(d + (t + 1) * s, "*"), i = t === g - 1 ? void 0 : r - n;
							e.push(o.UTF8ToString(n, i));
						}
						x.push([
							u,
							h,
							e,
							"cpu"
						]);
					} else if (_ === "gpu-buffer" && g > 0) {
						let e = o.jsepGetBuffer;
						if (!e) throw Error("preferredLocation \"gpu-buffer\" is not supported without using WebGPU.");
						let t = e(d), r = H(a, g);
						if (r === void 0 || !mt(u)) throw Error(`Unsupported data type: ${u}`);
						l = !0, x.push([
							u,
							h,
							{
								gpuBuffer: t,
								download: o.jsepCreateDownloader(t, r, u),
								dispose: () => {
									o._OrtReleaseTensor(n) !== 0 && z("Can't release tensor.");
								}
							},
							"gpu-buffer"
						]);
					} else if (_ === "ml-tensor" && g > 0) {
						let t = o.webnnEnsureTensor, r = o.webnnIsGraphInputOutputTypeSupported;
						if (!t || !r) throw Error("preferredLocation \"ml-tensor\" is not supported without using WebNN.");
						if (H(a, g) === void 0 || !ht(u)) throw Error(`Unsupported data type: ${u}`);
						if (!r(e, u, !1)) throw Error(`preferredLocation "ml-tensor" for ${u} output is not supported by current WebNN Context.`);
						let i = await t(e, d, a, h, !1);
						l = !0, x.push([
							u,
							h,
							{
								mlTensor: i,
								download: o.webnnCreateMLTensorDownloader(d, u),
								dispose: () => {
									o.webnnReleaseTensorId(d), o._OrtReleaseTensor(n);
								}
							},
							"ml-tensor"
						]);
					} else if (_ === "ml-tensor-cpu-output" && g > 0) {
						let e = o.webnnCreateMLTensorDownloader(d, u)(), t = x.length;
						l = !0, C.push((async () => {
							let r = [t, await e];
							return o.webnnReleaseTensorId(d), o._OrtReleaseTensor(n), r;
						})()), x.push([
							u,
							h,
							[],
							"cpu"
						]);
					} else {
						let e = new (ft(u))(g);
						new Uint8Array(e.buffer, e.byteOffset, e.byteLength).set(o.HEAPU8.subarray(d, d + e.byteLength)), x.push([
							u,
							h,
							e,
							"cpu"
						]);
					}
				} finally {
					o.stackRestore(a), u === "string" && d && o._free(d), l || o._OrtReleaseTensor(n);
				}
			}
			f && !p && (o._OrtClearBoundOutputs(f.handle) !== 0 && z("Can't clear bound outputs."), U.set(e, [
				l,
				u,
				d,
				f,
				p,
				!1
			]));
			for (let [e, t] of await Promise.all(C)) x[e][2] = t;
			return j("wasm ProcessOutputTensor"), x;
		} finally {
			o.webnnOnRunEnd?.(l), o.stackRestore(x), v.forEach((e) => o._OrtReleaseTensor(e)), y.forEach((e) => o._OrtReleaseTensor(e)), b.forEach((e) => o._free(e)), g !== 0 && o._OrtReleaseRunOptions(g), _.forEach((e) => o._free(e));
		}
	}, At = (e) => {
		let t = I(), n = U.get(e);
		if (!n) throw Error("invalid session id");
		let r = n[0], i = t._OrtEndProfiling(r);
		i === 0 && z("Can't get an profile file name."), t._OrtFree(i);
	}, jt = (e) => {
		let t = [];
		for (let n of e) {
			let e = n[2];
			!Array.isArray(e) && "buffer" in e && t.push(e.buffer);
		}
		return t;
	};
}), W, G, K, q, J, Nt, Pt, Y, X, Z, Ft, It, Lt, Rt, zt, Bt, Vt, Ht, Ut = o(() => {
	M(), Mt(), L(), Je(), W = () => !!x.wasm.proxy && typeof document < "u", K = !1, q = !1, J = !1, Y = /* @__PURE__ */ new Map(), X = (e, t) => {
		let n = Y.get(e);
		n ? n.push(t) : Y.set(e, [t]);
	}, Z = () => {
		if (K || !q || J || !G) throw Error("worker not ready");
	}, Ft = (e) => {
		switch (e.data.type) {
			case "init-wasm":
				K = !1, e.data.err ? (J = !0, Pt[1](e.data.err)) : (q = !0, Pt[0]()), Nt &&= (URL.revokeObjectURL(Nt), void 0);
				break;
			case "init-ep":
			case "copy-from":
			case "create":
			case "release":
			case "run":
			case "end-profiling": {
				let t = Y.get(e.data.type);
				e.data.err ? t.shift()[1](e.data.err) : t.shift()[0](e.data.out);
				break;
			}
			default:
		}
	}, It = async () => {
		if (!q) {
			if (K) throw Error("multiple calls to 'initWasm()' detected.");
			if (J) throw Error("previous call to 'initWasm()' failed.");
			if (K = !0, W()) return new Promise((e, t) => {
				G?.terminate(), Ge().then(([n, r]) => {
					try {
						G = r, G.onerror = (e) => t(e), G.onmessage = Ft, Pt = [e, t];
						let i = {
							type: "init-wasm",
							in: x
						};
						if (!i.in.wasm.wasmPaths && n) {
							let e = Re();
							e && (i.in.wasm.wasmPaths = e);
						}
						G.postMessage(i), Nt = n;
					} catch (e) {
						t(e);
					}
				}, t);
			});
			try {
				await et(x.wasm), await xt(x), q = !0;
			} catch (e) {
				throw J = !0, e;
			} finally {
				K = !1;
			}
		}
	}, Lt = async (e) => {
		if (W()) return Z(), new Promise((t, n) => {
			X("init-ep", [t, n]);
			let r = {
				type: "init-ep",
				in: {
					epName: e,
					env: x
				}
			};
			G.postMessage(r);
		});
		await St(x, e);
	}, Rt = async (e) => W() ? (Z(), new Promise((t, n) => {
		X("copy-from", [t, n]);
		let r = {
			type: "copy-from",
			in: { buffer: e }
		};
		G.postMessage(r, [e.buffer]);
	})) : Tt(e), zt = async (e, t) => {
		if (W()) {
			if (t?.preferredOutputLocation) throw Error("session option \"preferredOutputLocation\" is not supported for proxy.");
			return Z(), new Promise((n, r) => {
				X("create", [n, r]);
				let i = {
					type: "create",
					in: {
						model: e,
						options: { ...t }
					}
				}, a = [];
				e instanceof Uint8Array && a.push(e.buffer), G.postMessage(i, a);
			});
		} else return Et(e, t);
	}, Bt = async (e) => {
		if (W()) return Z(), new Promise((t, n) => {
			X("release", [t, n]);
			let r = {
				type: "release",
				in: e
			};
			G.postMessage(r);
		});
		Dt(e);
	}, Vt = async (e, t, n, r, i, a) => {
		if (W()) {
			if (n.some((e) => e[3] !== "cpu")) throw Error("input tensor on GPU is not supported for proxy.");
			if (i.some((e) => e)) throw Error("pre-allocated output tensor is not supported for proxy.");
			return Z(), new Promise((i, o) => {
				X("run", [i, o]);
				let s = n, c = {
					type: "run",
					in: {
						sessionId: e,
						inputIndices: t,
						inputs: s,
						outputIndices: r,
						options: a
					}
				};
				G.postMessage(c, jt(s));
			});
		} else return kt(e, t, n, r, i, a);
	}, Ht = async (e) => {
		if (W()) return Z(), new Promise((t, n) => {
			X("end-profiling", [t, n]);
			let r = {
				type: "end-profiling",
				in: e
			};
			G.postMessage(r);
		});
		At(e);
	};
}), Wt, Gt, Kt, qt = o(() => {
	M(), Ut(), _t(), ke(), yt(), Wt = (e, t) => {
		switch (e.location) {
			case "cpu": return [
				e.type,
				e.dims,
				e.data,
				"cpu"
			];
			case "gpu-buffer": return [
				e.type,
				e.dims,
				{ gpuBuffer: e.gpuBuffer },
				"gpu-buffer"
			];
			case "ml-tensor": return [
				e.type,
				e.dims,
				{ mlTensor: e.mlTensor },
				"ml-tensor"
			];
			default: throw Error(`invalid data location: ${e.location} for ${t()}`);
		}
	}, Gt = (e) => {
		switch (e[3]) {
			case "cpu": return new D(e[0], e[2], e[1]);
			case "gpu-buffer": {
				let t = e[0];
				if (!mt(t)) throw Error(`not supported data type: ${t} for deserializing GPU tensor`);
				let { gpuBuffer: n, download: r, dispose: i } = e[2];
				return D.fromGpuBuffer(n, {
					dataType: t,
					dims: e[1],
					download: r,
					dispose: i
				});
			}
			case "ml-tensor": {
				let t = e[0];
				if (!ht(t)) throw Error(`not supported data type: ${t} for deserializing MLTensor tensor`);
				let { mlTensor: n, download: r, dispose: i } = e[2];
				return D.fromMLTensor(n, {
					dataType: t,
					dims: e[1],
					download: r,
					dispose: i
				});
			}
			default: throw Error(`invalid data location: ${e[3]}`);
		}
	}, Kt = class {
		async fetchModelAndCopyToWasmMemory(e) {
			return Rt(await vt(e));
		}
		async loadModel(e, t) {
			O();
			let n;
			n = typeof e == "string" ? await this.fetchModelAndCopyToWasmMemory(e) : e, [this.sessionId, this.inputNames, this.outputNames, this.inputMetadata, this.outputMetadata] = await zt(n, t), k();
		}
		async dispose() {
			return Bt(this.sessionId);
		}
		async run(e, t, n) {
			O();
			let r = [], i = [];
			Object.entries(e).forEach((e) => {
				let t = e[0], n = e[1], a = this.inputNames.indexOf(t);
				if (a === -1) throw Error(`invalid input '${t}'`);
				r.push(n), i.push(a);
			});
			let a = [], o = [];
			Object.entries(t).forEach((e) => {
				let t = e[0], n = e[1], r = this.outputNames.indexOf(t);
				if (r === -1) throw Error(`invalid output '${t}'`);
				a.push(n), o.push(r);
			});
			let s = r.map((e, t) => Wt(e, () => `input "${this.inputNames[i[t]]}"`)), c = a.map((e, t) => e ? Wt(e, () => `output "${this.outputNames[o[t]]}"`) : null), l = await Vt(this.sessionId, i, s, o, c, n), u = {};
			for (let e = 0; e < l.length; e++) u[this.outputNames[o[e]]] = a[e] ?? Gt(l[e]);
			return k(), u;
		}
		startProfiling() {}
		endProfiling() {
			Ht(this.sessionId);
		}
	};
}), Jt = {};
s(Jt, {
	OnnxruntimeWebAssemblyBackend: () => Xt,
	initializeFlags: () => Yt,
	wasmBackend: () => Zt
});
var Yt, Xt, Zt, Qt = o(() => {
	M(), Ut(), qt(), Yt = () => {
		(typeof x.wasm.initTimeout != "number" || x.wasm.initTimeout < 0) && (x.wasm.initTimeout = 0);
		let e = x.wasm.simd;
		if (typeof e != "boolean" && e !== void 0 && e !== "fixed" && e !== "relaxed" && (console.warn(`Property "env.wasm.simd" is set to unknown value "${e}". Reset it to \`false\` and ignore SIMD feature checking.`), x.wasm.simd = !1), typeof x.wasm.proxy != "boolean" && (x.wasm.proxy = !1), typeof x.wasm.trace != "boolean" && (x.wasm.trace = !1), typeof x.wasm.numThreads != "number" || !Number.isInteger(x.wasm.numThreads) || x.wasm.numThreads <= 0) if (typeof self < "u" && !self.crossOriginIsolated) x.wasm.numThreads = 1;
		else {
			let e = typeof navigator > "u" ? a("node:os").cpus().length : navigator.hardwareConcurrency;
			x.wasm.numThreads = Math.min(4, Math.ceil((e || 1) / 2));
		}
	}, Xt = class {
		async init(e) {
			Yt(), await It(), await Lt(e);
		}
		async createInferenceSessionHandler(e, t) {
			let n = new Kt();
			return await n.loadModel(e, t), n;
		}
	}, Zt = new Xt();
});
M(), M(), M();
var $t = "1.24.3";
{
	let e = (Qt(), l(Jt)).wasmBackend;
	f("cpu", e, 10), f("wasm", e, 10);
}
Object.defineProperty(x.versions, "web", {
	value: $t,
	enumerable: !0
});
//#endregion
//#region public/models/dinov2/manifest.json
var Q = {
	path: "/models/dinov2/dinov2-vits14-reg-patches-int8.onnx.gzip",
	sha256: "d46cefd48b765afe1fe0dad6ef6d627d3f2d505a5fc2aafe628c9128c92a8c51",
	bytes: 23134169,
	format: "ONNX",
	opset: 17,
	quantization: "symmetric per-output-channel INT8 constant MatMul weights, standard QDQ; activations and remaining operations float32",
	input_name: "image",
	input_shape: [
		1,
		3,
		224,
		224
	],
	output_name: "patches",
	output_shape: [
		1,
		256,
		384
	],
	download: {
		path: "/models/dinov2/dinov2-vits14-reg-patches-int8.onnx.gzip",
		encoding: "gzip",
		bytes: 20674366,
		sha256: "a951cd506f8b8c84a7602c7a399b87fec2c41c2fe67e0cd09cfd72551d537c25"
	},
	decoded_filename: "dinov2-vits14-reg-patches-int8.onnx",
	size_hash_scope: "artifact.bytes/sha256 describe the decoded ONNX; artifact.download describes the actual compressed public asset."
}, en = 25 * 1024 * 1024, tn = /^[a-f0-9]{64}$/;
async function nn(e, t) {
	let n = e.getReader(), r = [], i = 0;
	try {
		for (;;) {
			let { value: e, done: a } = await n.read();
			if (a) break;
			if (i += e.length, i > t) throw Error("The model exceeded its verified byte bound.");
			r.push(e);
		}
	} catch (e) {
		throw await n.cancel().catch(() => {}), e;
	} finally {
		n.releaseLock();
	}
	if (i !== t) throw Error("The model size did not match its manifest.");
	let a = new Uint8Array(i), o = 0;
	for (let e of r) a.set(e, o), o += e.length;
	return a;
}
var rn = async (e) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", e.buffer))].map((e) => e.toString(16).padStart(2, "0")).join("");
async function an(e, t) {
	if (!Number.isInteger(t.bytes) || t.bytes < 1 || t.bytes > en || !Number.isInteger(t.decodedBytes) || t.decodedBytes < 1 || t.decodedBytes > en || !tn.test(t.sha256) || !tn.test(t.decodedSha256)) throw Error("The model download manifest is invalid.");
	if (!e.ok || Number(e.headers.get("content-length")) > t.bytes) throw await e.body?.cancel(), Error("The verified DINOv2 model is unavailable.");
	if (!e.body) throw Error("The model response is empty.");
	let n = await nn(e.body, t.bytes);
	if (await rn(n) !== t.sha256) throw Error("The compressed model did not match its verified SHA-256.");
	if (typeof DecompressionStream > "u") throw Error("This browser cannot decode the compressed visual model.");
	let r = await nn(new Blob([n.buffer]).stream().pipeThrough(new DecompressionStream("gzip")), t.decodedBytes);
	if (await rn(r) !== t.decodedSha256) throw Error("The decoded model did not match its verified SHA-256.");
	return r;
}
//#endregion
//#region lib/dino-worker.ts
var $ = self, on = (e) => $.postMessage({
	type: "progress",
	phase: e
}), sn = !1;
$.onmessage = async (e) => {
	if (sn) return;
	sn = !0;
	let t;
	try {
		let { before: n, after: r } = e.data;
		if (!(n instanceof ArrayBuffer) || !(r instanceof ArrayBuffer) || n.byteLength !== 602112 || r.byteLength !== 602112) throw Error("Invalid image tensor.");
		on("Loading the DINOv2 model"), x.wasm.numThreads = 1, x.wasm.proxy = !1, x.wasm.wasmPaths = {
			wasm: new URL("/models/dinov2/runtime/ort-wasm-simd-threaded.wasm", $.location.origin).href,
			mjs: new URL("/models/dinov2/runtime/ort-wasm-simd-threaded.mjs", $.location.origin).href
		};
		let i = new URL(Q.download.path, $.location.origin);
		if (i.origin !== $.location.origin || i.pathname !== "/models/dinov2/dinov2-vits14-reg-patches-int8.onnx.gzip" || i.search || i.hash) throw Error("The model asset must use its pinned same-origin path.");
		let a = await an(await fetch(i.href, {
			credentials: "same-origin",
			redirect: "error",
			cache: "force-cache"
		}), {
			bytes: Q.download.bytes,
			sha256: Q.download.sha256,
			decodedBytes: Q.bytes,
			decodedSha256: Q.sha256
		});
		t = await Ce.create(a, {
			executionProviders: ["wasm"],
			graphOptimizationLevel: "disabled"
		});
		let o = [];
		for (let [e, i] of [n, r].entries()) {
			on(`Reading ${e === 0 ? "2020" : "2024"} visual features`);
			let n = new D("float32", new Float32Array(i), [
				1,
				3,
				224,
				224
			]), r = await t.run({ image: n }), a = r.patches;
			if (!a || a.type !== "float32" || a.dims.join(",") !== "1,256,384") throw Error("DINO returned an unexpected feature shape.");
			o.push(new Float32Array(a.data)), n.dispose();
			for (let e of Object.values(r)) e.dispose();
		}
		$.postMessage({
			type: "result",
			before: o[0].buffer,
			after: o[1].buffer
		}, [o[0].buffer, o[1].buffer]);
	} catch (e) {
		$.postMessage({
			type: "error",
			message: e instanceof Error ? e.message : "The browser could not run the visual comparison."
		});
	} finally {
		await t?.release();
	}
};
//#endregion
