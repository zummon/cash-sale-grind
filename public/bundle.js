var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        if (value === null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }

    function destroy_block(block, lookup) {
        block.d(1);
        lookup.delete(block.key);
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src/App.svelte generated by Svelte v3.52.0 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[27] = list[i];
    	child_ctx[28] = list;
    	child_ctx[29] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[30] = list[i];
    	child_ctx[29] = i;
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[32] = list[i];
    	child_ctx[29] = i;
    	return child_ctx;
    }

    // (80:1) {#each Object.keys(data) as lng, i (`lang-${i}
    function create_each_block_2(key_1, ctx) {
    	let button;
    	let t_value = (/*lng*/ ctx[32] == 'th' ? 'ไทย' : 'Eng') + "";
    	let t;
    	let button_class_value;
    	let mounted;
    	let dispose;

    	function click_handler() {
    		return /*click_handler*/ ctx[7](/*lng*/ ctx[32]);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			button = element("button");
    			t = text(t_value);

    			attr(button, "class", button_class_value = "font-bold p-2.5 " + (/*q*/ ctx[1].lang === /*lng*/ ctx[32]
    			? "text-[#c34a36] bg-white cursor-default"
    			: "text-white bg-[#c34a36] cursor-pointer"));

    			this.first = button;
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			append(button, t);

    			if (!mounted) {
    				dispose = listen(button, "click", click_handler);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*data*/ 1 && t_value !== (t_value = (/*lng*/ ctx[32] == 'th' ? 'ไทย' : 'Eng') + "")) set_data(t, t_value);

    			if (dirty[0] & /*q, data*/ 3 && button_class_value !== (button_class_value = "font-bold p-2.5 " + (/*q*/ ctx[1].lang === /*lng*/ ctx[32]
    			? "text-[#c34a36] bg-white cursor-default"
    			: "text-white bg-[#c34a36] cursor-pointer"))) {
    				attr(button, "class", button_class_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (87:1) {#each Object.keys(data[q.lang].label) as dc, i (`doc-${i}
    function create_each_block_1(key_1, ctx) {
    	let button;
    	let t0_value = /*data*/ ctx[0][/*q*/ ctx[1].lang].label[/*dc*/ ctx[30]].title + "";
    	let t0;
    	let t1;
    	let button_class_value;
    	let mounted;
    	let dispose;

    	function click_handler_1() {
    		return /*click_handler_1*/ ctx[8](/*dc*/ ctx[30]);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			button = element("button");
    			t0 = text(t0_value);
    			t1 = space();

    			attr(button, "class", button_class_value = "font-bold p-2.5 " + (/*q*/ ctx[1].doc === /*dc*/ ctx[30]
    			? "text-[#c34a36] bg-white cursor-default"
    			: "text-white bg-[#c34a36] cursor-pointer"));

    			this.first = button;
    		},
    		m(target, anchor) {
    			insert(target, button, anchor);
    			append(button, t0);
    			append(button, t1);

    			if (!mounted) {
    				dispose = listen(button, "click", click_handler_1);
    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*data, q*/ 3 && t0_value !== (t0_value = /*data*/ ctx[0][/*q*/ ctx[1].lang].label[/*dc*/ ctx[30]].title + "")) set_data(t0, t0_value);

    			if (dirty[0] & /*q, data*/ 3 && button_class_value !== (button_class_value = "font-bold p-2.5 " + (/*q*/ ctx[1].doc === /*dc*/ ctx[30]
    			? "text-[#c34a36] bg-white cursor-default"
    			: "text-white bg-[#c34a36] cursor-pointer"))) {
    				attr(button, "class", button_class_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (145:3) {#each q.desc as _, i (`item-${i}
    function create_each_block(key_1, ctx) {
    	let tr;
    	let td0;
    	let t0;
    	let td1;
    	let t1_value = /*price*/ ctx[3](/*q*/ ctx[1].price[/*i*/ ctx[29]]) + "";
    	let t1;
    	let t2;
    	let td2;
    	let t3_value = /*qty*/ ctx[4](/*q*/ ctx[1].qty[/*i*/ ctx[29]]) + "";
    	let t3;
    	let t4;
    	let td3;
    	let t5_value = /*price*/ ctx[3](/*q*/ ctx[1].amt[/*i*/ ctx[29]]) + "";
    	let t5;
    	let t6;
    	let mounted;
    	let dispose;

    	function td0_input_handler() {
    		/*td0_input_handler*/ ctx[17].call(td0, /*i*/ ctx[29]);
    	}

    	function focus_handler(...args) {
    		return /*focus_handler*/ ctx[18](/*i*/ ctx[29], ...args);
    	}

    	function input_handler(...args) {
    		return /*input_handler*/ ctx[19](/*i*/ ctx[29], ...args);
    	}

    	function blur_handler(...args) {
    		return /*blur_handler*/ ctx[20](/*i*/ ctx[29], ...args);
    	}

    	function focus_handler_1(...args) {
    		return /*focus_handler_1*/ ctx[21](/*i*/ ctx[29], ...args);
    	}

    	function input_handler_1(...args) {
    		return /*input_handler_1*/ ctx[22](/*i*/ ctx[29], ...args);
    	}

    	function blur_handler_1(...args) {
    		return /*blur_handler_1*/ ctx[23](/*i*/ ctx[29], ...args);
    	}

    	return {
    		key: key_1,
    		first: null,
    		c() {
    			tr = element("tr");
    			td0 = element("td");
    			t0 = space();
    			td1 = element("td");
    			t1 = text(t1_value);
    			t2 = space();
    			td2 = element("td");
    			t3 = text(t3_value);
    			t4 = space();
    			td3 = element("td");
    			t5 = text(t5_value);
    			t6 = space();
    			attr(td0, "class", "p-2 border-r-2 border-[#b0a8b9] break-all");
    			attr(td0, "contenteditable", "true");
    			if (/*q*/ ctx[1].desc[/*i*/ ctx[29]] === void 0) add_render_callback(td0_input_handler);
    			attr(td1, "class", "p-2 border-r-2 border-[#b0a8b9] text-center");
    			attr(td1, "contenteditable", "true");
    			attr(td2, "class", "p-2 border-r-2 border-[#b0a8b9] text-center");
    			attr(td2, "contenteditable", "true");
    			attr(td3, "class", "p-2 text-right");
    			attr(tr, "class", "even:bg-[#f4f4f4]");
    			this.first = tr;
    		},
    		m(target, anchor) {
    			insert(target, tr, anchor);
    			append(tr, td0);

    			if (/*q*/ ctx[1].desc[/*i*/ ctx[29]] !== void 0) {
    				td0.textContent = /*q*/ ctx[1].desc[/*i*/ ctx[29]];
    			}

    			append(tr, t0);
    			append(tr, td1);
    			append(td1, t1);
    			append(tr, t2);
    			append(tr, td2);
    			append(td2, t3);
    			append(tr, t4);
    			append(tr, td3);
    			append(td3, t5);
    			append(tr, t6);

    			if (!mounted) {
    				dispose = [
    					listen(td0, "input", td0_input_handler),
    					listen(td1, "focus", focus_handler),
    					listen(td1, "input", input_handler),
    					listen(td1, "blur", blur_handler),
    					listen(td2, "focus", focus_handler_1),
    					listen(td2, "input", input_handler_1),
    					listen(td2, "blur", blur_handler_1)
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].desc[/*i*/ ctx[29]] !== td0.textContent) {
    				td0.textContent = /*q*/ ctx[1].desc[/*i*/ ctx[29]];
    			}

    			if (dirty[0] & /*q*/ 2 && t1_value !== (t1_value = /*price*/ ctx[3](/*q*/ ctx[1].price[/*i*/ ctx[29]]) + "")) set_data(t1, t1_value);
    			if (dirty[0] & /*q*/ 2 && t3_value !== (t3_value = /*qty*/ ctx[4](/*q*/ ctx[1].qty[/*i*/ ctx[29]]) + "")) set_data(t3, t3_value);
    			if (dirty[0] & /*q*/ 2 && t5_value !== (t5_value = /*price*/ ctx[3](/*q*/ ctx[1].amt[/*i*/ ctx[29]]) + "")) set_data(t5, t5_value);
    		},
    		d(detaching) {
    			if (detaching) detach(tr);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div0;
    	let each_blocks_2 = [];
    	let each0_lookup = new Map();
    	let t0;
    	let each_blocks_1 = [];
    	let each1_lookup = new Map();
    	let t1;
    	let div21;
    	let div2;
    	let h1;
    	let t2_value = /*l*/ ctx[2].title + "";
    	let t2;
    	let t3;
    	let div1;
    	let p0;
    	let t4;
    	let p1;
    	let t5;
    	let p2;
    	let t6;
    	let div15;
    	let div7;
    	let div4;
    	let div3;
    	let t7_value = /*l*/ ctx[2].no + "";
    	let t7;
    	let t8;
    	let p3;
    	let t9;
    	let div6;
    	let div5;
    	let t10_value = /*l*/ ctx[2].date + "";
    	let t10;
    	let t11;
    	let p4;
    	let t12;
    	let div14;
    	let h3;
    	let t13_value = /*l*/ ctx[2].customer + "";
    	let t13;
    	let t14;
    	let div9;
    	let div8;
    	let t15_value = /*l*/ ctx[2].name + "";
    	let t15;
    	let t16;
    	let p5;
    	let t17;
    	let div11;
    	let div10;
    	let t18_value = /*l*/ ctx[2].address + "";
    	let t18;
    	let t19;
    	let p6;
    	let t20;
    	let div13;
    	let div12;
    	let t21_value = /*l*/ ctx[2].id + "";
    	let t21;
    	let t22;
    	let p7;
    	let t23;
    	let table;
    	let thead;
    	let tr0;
    	let td0;
    	let t24_value = /*l*/ ctx[2].desc + "";
    	let t24;
    	let t25;
    	let button0;
    	let t27;
    	let button1;
    	let t29;
    	let td1;
    	let t30_value = /*l*/ ctx[2].price + "";
    	let t30;
    	let t31;
    	let td2;
    	let t32_value = /*l*/ ctx[2].qty + "";
    	let t32;
    	let t33;
    	let td3;
    	let t34_value = /*l*/ ctx[2].amt + "";
    	let t34;
    	let t35;
    	let tbody;
    	let each_blocks = [];
    	let each2_lookup = new Map();
    	let t36;
    	let tfoot;
    	let tr1;
    	let td4;
    	let t37;
    	let td5;
    	let t38;
    	let td6;
    	let t39_value = /*l*/ ctx[2].total + "";
    	let t39;
    	let t40;
    	let td7;
    	let t41_value = /*price*/ ctx[3](/*q*/ ctx[1].total) + "";
    	let t41;
    	let t42;
    	let tr2;
    	let td8;
    	let t43;
    	let td9;
    	let t44;
    	let td10;
    	let t45_value = /*l*/ ctx[2].cur + "";
    	let t45;
    	let t46;
    	let td11;
    	let t47;
    	let div20;
    	let div18;
    	let div17;
    	let div16;
    	let t48_value = /*l*/ ctx[2].rSign + "";
    	let t48;
    	let t49;
    	let p8;
    	let t50;
    	let div19;
    	let t51_value = /*l*/ ctx[2].thank + "";
    	let t51;
    	let t52;
    	let div22;
    	let button2;
    	let mounted;
    	let dispose;
    	let each_value_2 = Object.keys(/*data*/ ctx[0]);
    	const get_key = ctx => `lang-${/*i*/ ctx[29]}`;

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		let child_ctx = get_each_context_2(ctx, each_value_2, i);
    		let key = get_key(child_ctx);
    		each0_lookup.set(key, each_blocks_2[i] = create_each_block_2(key, child_ctx));
    	}

    	let each_value_1 = Object.keys(/*data*/ ctx[0][/*q*/ ctx[1].lang].label);
    	const get_key_1 = ctx => `doc-${/*i*/ ctx[29]}`;

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		let child_ctx = get_each_context_1(ctx, each_value_1, i);
    		let key = get_key_1(child_ctx);
    		each1_lookup.set(key, each_blocks_1[i] = create_each_block_1(key, child_ctx));
    	}

    	let each_value = /*q*/ ctx[1].desc;
    	const get_key_2 = ctx => `item-${/*i*/ ctx[29]}`;

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context(ctx, each_value, i);
    		let key = get_key_2(child_ctx);
    		each2_lookup.set(key, each_blocks[i] = create_each_block(key, child_ctx));
    	}

    	return {
    		c() {
    			div0 = element("div");

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].c();
    			}

    			t0 = space();

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].c();
    			}

    			t1 = space();
    			div21 = element("div");
    			div2 = element("div");
    			h1 = element("h1");
    			t2 = text(t2_value);
    			t3 = space();
    			div1 = element("div");
    			p0 = element("p");
    			t4 = space();
    			p1 = element("p");
    			t5 = space();
    			p2 = element("p");
    			t6 = space();
    			div15 = element("div");
    			div7 = element("div");
    			div4 = element("div");
    			div3 = element("div");
    			t7 = text(t7_value);
    			t8 = space();
    			p3 = element("p");
    			t9 = space();
    			div6 = element("div");
    			div5 = element("div");
    			t10 = text(t10_value);
    			t11 = space();
    			p4 = element("p");
    			t12 = space();
    			div14 = element("div");
    			h3 = element("h3");
    			t13 = text(t13_value);
    			t14 = space();
    			div9 = element("div");
    			div8 = element("div");
    			t15 = text(t15_value);
    			t16 = space();
    			p5 = element("p");
    			t17 = space();
    			div11 = element("div");
    			div10 = element("div");
    			t18 = text(t18_value);
    			t19 = space();
    			p6 = element("p");
    			t20 = space();
    			div13 = element("div");
    			div12 = element("div");
    			t21 = text(t21_value);
    			t22 = space();
    			p7 = element("p");
    			t23 = space();
    			table = element("table");
    			thead = element("thead");
    			tr0 = element("tr");
    			td0 = element("td");
    			t24 = text(t24_value);
    			t25 = space();
    			button0 = element("button");
    			button0.textContent = "+";
    			t27 = space();
    			button1 = element("button");
    			button1.textContent = "-";
    			t29 = space();
    			td1 = element("td");
    			t30 = text(t30_value);
    			t31 = space();
    			td2 = element("td");
    			t32 = text(t32_value);
    			t33 = space();
    			td3 = element("td");
    			t34 = text(t34_value);
    			t35 = space();
    			tbody = element("tbody");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t36 = space();
    			tfoot = element("tfoot");
    			tr1 = element("tr");
    			td4 = element("td");
    			t37 = space();
    			td5 = element("td");
    			t38 = space();
    			td6 = element("td");
    			t39 = text(t39_value);
    			t40 = space();
    			td7 = element("td");
    			t41 = text(t41_value);
    			t42 = space();
    			tr2 = element("tr");
    			td8 = element("td");
    			t43 = space();
    			td9 = element("td");
    			t44 = space();
    			td10 = element("td");
    			t45 = text(t45_value);
    			t46 = space();
    			td11 = element("td");
    			t47 = space();
    			div20 = element("div");
    			div18 = element("div");
    			div17 = element("div");
    			div16 = element("div");
    			t48 = text(t48_value);
    			t49 = space();
    			p8 = element("p");
    			t50 = space();
    			div19 = element("div");
    			t51 = text(t51_value);
    			t52 = space();
    			div22 = element("div");
    			button2 = element("button");
    			button2.textContent = "Print";
    			attr(div0, "class", "flex flex-wrap justify-center items-center my-4 print:hidden");
    			attr(h1, "class", "mr-4 ml-4 p-4 text-3xl font-bold");
    			attr(p0, "class", "break-all mb-2");
    			attr(p0, "contenteditable", "true");
    			if (/*q*/ ctx[1].rName === void 0) add_render_callback(() => /*p0_input_handler*/ ctx[9].call(p0));
    			attr(p1, "class", "break-all mb-2");
    			attr(p1, "contenteditable", "true");
    			if (/*q*/ ctx[1].rAddress === void 0) add_render_callback(() => /*p1_input_handler*/ ctx[10].call(p1));
    			attr(p2, "class", "break-all");
    			attr(p2, "contenteditable", "true");
    			if (/*q*/ ctx[1].rId === void 0) add_render_callback(() => /*p2_input_handler*/ ctx[11].call(p2));
    			attr(div1, "class", "flex-grow text-center border-2 rounded-lg border-[#b0a8b9] p-1.5");
    			attr(div2, "class", "flex mb-4");
    			attr(div3, "class", "mr-2");
    			attr(p3, "class", "break-all flex-grow");
    			attr(p3, "contenteditable", "true");
    			if (/*q*/ ctx[1].no === void 0) add_render_callback(() => /*p3_input_handler*/ ctx[12].call(p3));
    			attr(div4, "class", "flex mb-4 border-2 rounded-lg border-[#b0a8b9] p-1.5");
    			attr(div5, "class", "mr-2");
    			attr(p4, "class", "break-all flex-grow");
    			attr(p4, "contenteditable", "true");
    			if (/*q*/ ctx[1].date === void 0) add_render_callback(() => /*p4_input_handler*/ ctx[13].call(p4));
    			attr(div6, "class", "flex mb-4 border-2 rounded-lg border-[#b0a8b9] p-1.5");
    			attr(div7, "class", "mr-4 ml-4 flex-[1]");
    			attr(h3, "class", "text-center text-lg font-semibold");
    			attr(div8, "class", "mr-2");
    			attr(p5, "class", "break-all flex-grow font-bold border-b-2 border-[#b0a8b9]");
    			attr(p5, "contenteditable", "true");
    			if (/*q*/ ctx[1].name === void 0) add_render_callback(() => /*p5_input_handler*/ ctx[14].call(p5));
    			attr(div9, "class", "flex mb-4");
    			attr(div10, "class", "mr-2");
    			attr(p6, "class", "break-all flex-grow font-bold border-b-2 border-[#b0a8b9]");
    			attr(p6, "contenteditable", "true");
    			if (/*q*/ ctx[1].address === void 0) add_render_callback(() => /*p6_input_handler*/ ctx[15].call(p6));
    			attr(div11, "class", "flex mb-4");
    			attr(div12, "class", "mr-2");
    			attr(p7, "class", "break-all flex-grow font-bold border-b-2 border-[#b0a8b9]");
    			attr(p7, "contenteditable", "true");
    			if (/*q*/ ctx[1].id === void 0) add_render_callback(() => /*p7_input_handler*/ ctx[16].call(p7));
    			attr(div13, "class", "flex mb-4");
    			attr(div14, "class", "flex-[2]");
    			attr(div15, "class", "flex");
    			attr(button0, "class", "font-bold text-white bg-[#c34a36] text-[1.375rem] cursor-pointer p-2.5 print:hidden");
    			attr(button1, "class", "font-bold text-white bg-[#c34a36] text-[1.375rem] cursor-pointer p-2.5 print:hidden");
    			attr(td0, "class", "p-2 break-all border-b-2 border-[#b0a8b9]");
    			attr(td1, "class", "p-2 text-center border-b-2 border-[#b0a8b9] whitespace-nowrap w-2");
    			attr(td2, "class", "p-2 text-center border-b-2 border-[#b0a8b9] whitespace-nowrap w-2");
    			attr(td3, "class", "p-2 text-center border-b-2 border-[#b0a8b9] whitespace-nowrap w-2");
    			attr(tr0, "class", "font-bold");
    			attr(td5, "class", "p-2 border-r-2 border-[#b0a8b9]");
    			attr(td6, "class", "p-2 border-r-2 border-b-2 border-[#b0a8b9] text-right whitespace-nowrap");
    			attr(td7, "class", "p-2 border-b-2 border-[#b0a8b9] text-right whitespace-nowrap");
    			attr(tr1, "class", "font-bold");
    			attr(td10, "class", "p-2 text-right whitespace-nowrap");
    			attr(td11, "class", "p-2 text-right whitespace-nowrap");
    			attr(td11, "contenteditable", "true");
    			if (/*q*/ ctx[1].cur === void 0) add_render_callback(() => /*td11_input_handler*/ ctx[24].call(td11));
    			attr(table, "class", "mb-4 w-full");
    			attr(div16, "class", "mr-2 font-bold");
    			attr(p8, "class", "break-all flex-grow border-b-2 border-[#b0a8b9]");
    			attr(p8, "contenteditable", "true");
    			attr(div17, "class", "flex mb-4");
    			attr(div18, "class", "flex-[2] mr-4 ml-4");
    			attr(div19, "class", "flex-[1] font-bold text-right");
    			attr(div20, "class", "flex");
    			attr(div21, "class", "text-sm text-[#4b4453] bg-white py-6 px-3 max-w-[40rem] mx-auto print:max-w-none print:mx-0");
    			set_style(div21, "font-family", "'Lucida Sans', 'Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif");
    			attr(button2, "class", "font-bold text-white bg-[#c34a36] cursor-pointer p-2.5");
    			attr(div22, "class", "flex flex-wrap justify-center items-center my-4 print:hidden");
    		},
    		m(target, anchor) {
    			insert(target, div0, anchor);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].m(div0, null);
    			}

    			append(div0, t0);

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].m(div0, null);
    			}

    			insert(target, t1, anchor);
    			insert(target, div21, anchor);
    			append(div21, div2);
    			append(div2, h1);
    			append(h1, t2);
    			append(div2, t3);
    			append(div2, div1);
    			append(div1, p0);

    			if (/*q*/ ctx[1].rName !== void 0) {
    				p0.textContent = /*q*/ ctx[1].rName;
    			}

    			append(div1, t4);
    			append(div1, p1);

    			if (/*q*/ ctx[1].rAddress !== void 0) {
    				p1.textContent = /*q*/ ctx[1].rAddress;
    			}

    			append(div1, t5);
    			append(div1, p2);

    			if (/*q*/ ctx[1].rId !== void 0) {
    				p2.textContent = /*q*/ ctx[1].rId;
    			}

    			append(div21, t6);
    			append(div21, div15);
    			append(div15, div7);
    			append(div7, div4);
    			append(div4, div3);
    			append(div3, t7);
    			append(div4, t8);
    			append(div4, p3);

    			if (/*q*/ ctx[1].no !== void 0) {
    				p3.textContent = /*q*/ ctx[1].no;
    			}

    			append(div7, t9);
    			append(div7, div6);
    			append(div6, div5);
    			append(div5, t10);
    			append(div6, t11);
    			append(div6, p4);

    			if (/*q*/ ctx[1].date !== void 0) {
    				p4.textContent = /*q*/ ctx[1].date;
    			}

    			append(div15, t12);
    			append(div15, div14);
    			append(div14, h3);
    			append(h3, t13);
    			append(div14, t14);
    			append(div14, div9);
    			append(div9, div8);
    			append(div8, t15);
    			append(div9, t16);
    			append(div9, p5);

    			if (/*q*/ ctx[1].name !== void 0) {
    				p5.textContent = /*q*/ ctx[1].name;
    			}

    			append(div14, t17);
    			append(div14, div11);
    			append(div11, div10);
    			append(div10, t18);
    			append(div11, t19);
    			append(div11, p6);

    			if (/*q*/ ctx[1].address !== void 0) {
    				p6.textContent = /*q*/ ctx[1].address;
    			}

    			append(div14, t20);
    			append(div14, div13);
    			append(div13, div12);
    			append(div12, t21);
    			append(div13, t22);
    			append(div13, p7);

    			if (/*q*/ ctx[1].id !== void 0) {
    				p7.textContent = /*q*/ ctx[1].id;
    			}

    			append(div21, t23);
    			append(div21, table);
    			append(table, thead);
    			append(thead, tr0);
    			append(tr0, td0);
    			append(td0, t24);
    			append(td0, t25);
    			append(td0, button0);
    			append(td0, t27);
    			append(td0, button1);
    			append(tr0, t29);
    			append(tr0, td1);
    			append(td1, t30);
    			append(tr0, t31);
    			append(tr0, td2);
    			append(td2, t32);
    			append(tr0, t33);
    			append(tr0, td3);
    			append(td3, t34);
    			append(table, t35);
    			append(table, tbody);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(tbody, null);
    			}

    			append(table, t36);
    			append(table, tfoot);
    			append(tfoot, tr1);
    			append(tr1, td4);
    			append(tr1, t37);
    			append(tr1, td5);
    			append(tr1, t38);
    			append(tr1, td6);
    			append(td6, t39);
    			append(tr1, t40);
    			append(tr1, td7);
    			append(td7, t41);
    			append(tfoot, t42);
    			append(tfoot, tr2);
    			append(tr2, td8);
    			append(tr2, t43);
    			append(tr2, td9);
    			append(tr2, t44);
    			append(tr2, td10);
    			append(td10, t45);
    			append(tr2, t46);
    			append(tr2, td11);

    			if (/*q*/ ctx[1].cur !== void 0) {
    				td11.textContent = /*q*/ ctx[1].cur;
    			}

    			append(div21, t47);
    			append(div21, div20);
    			append(div20, div18);
    			append(div18, div17);
    			append(div17, div16);
    			append(div16, t48);
    			append(div17, t49);
    			append(div17, p8);
    			append(div20, t50);
    			append(div20, div19);
    			append(div19, t51);
    			insert(target, t52, anchor);
    			insert(target, div22, anchor);
    			append(div22, button2);

    			if (!mounted) {
    				dispose = [
    					listen(p0, "input", /*p0_input_handler*/ ctx[9]),
    					listen(p1, "input", /*p1_input_handler*/ ctx[10]),
    					listen(p2, "input", /*p2_input_handler*/ ctx[11]),
    					listen(p3, "input", /*p3_input_handler*/ ctx[12]),
    					listen(p4, "input", /*p4_input_handler*/ ctx[13]),
    					listen(p5, "input", /*p5_input_handler*/ ctx[14]),
    					listen(p6, "input", /*p6_input_handler*/ ctx[15]),
    					listen(p7, "input", /*p7_input_handler*/ ctx[16]),
    					listen(button0, "click", /*addItem*/ ctx[5]),
    					listen(button1, "click", /*removeItem*/ ctx[6]),
    					listen(td11, "input", /*td11_input_handler*/ ctx[24]),
    					listen(button2, "click", /*click_handler_2*/ ctx[25])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*q, data*/ 3) {
    				each_value_2 = Object.keys(/*data*/ ctx[0]);
    				each_blocks_2 = update_keyed_each(each_blocks_2, dirty, get_key, 1, ctx, each_value_2, each0_lookup, div0, destroy_block, create_each_block_2, t0, get_each_context_2);
    			}

    			if (dirty[0] & /*q, data*/ 3) {
    				each_value_1 = Object.keys(/*data*/ ctx[0][/*q*/ ctx[1].lang].label);
    				each_blocks_1 = update_keyed_each(each_blocks_1, dirty, get_key_1, 1, ctx, each_value_1, each1_lookup, div0, destroy_block, create_each_block_1, null, get_each_context_1);
    			}

    			if (dirty[0] & /*l*/ 4 && t2_value !== (t2_value = /*l*/ ctx[2].title + "")) set_data(t2, t2_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].rName !== p0.textContent) {
    				p0.textContent = /*q*/ ctx[1].rName;
    			}

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].rAddress !== p1.textContent) {
    				p1.textContent = /*q*/ ctx[1].rAddress;
    			}

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].rId !== p2.textContent) {
    				p2.textContent = /*q*/ ctx[1].rId;
    			}

    			if (dirty[0] & /*l*/ 4 && t7_value !== (t7_value = /*l*/ ctx[2].no + "")) set_data(t7, t7_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].no !== p3.textContent) {
    				p3.textContent = /*q*/ ctx[1].no;
    			}

    			if (dirty[0] & /*l*/ 4 && t10_value !== (t10_value = /*l*/ ctx[2].date + "")) set_data(t10, t10_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].date !== p4.textContent) {
    				p4.textContent = /*q*/ ctx[1].date;
    			}

    			if (dirty[0] & /*l*/ 4 && t13_value !== (t13_value = /*l*/ ctx[2].customer + "")) set_data(t13, t13_value);
    			if (dirty[0] & /*l*/ 4 && t15_value !== (t15_value = /*l*/ ctx[2].name + "")) set_data(t15, t15_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].name !== p5.textContent) {
    				p5.textContent = /*q*/ ctx[1].name;
    			}

    			if (dirty[0] & /*l*/ 4 && t18_value !== (t18_value = /*l*/ ctx[2].address + "")) set_data(t18, t18_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].address !== p6.textContent) {
    				p6.textContent = /*q*/ ctx[1].address;
    			}

    			if (dirty[0] & /*l*/ 4 && t21_value !== (t21_value = /*l*/ ctx[2].id + "")) set_data(t21, t21_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].id !== p7.textContent) {
    				p7.textContent = /*q*/ ctx[1].id;
    			}

    			if (dirty[0] & /*l*/ 4 && t24_value !== (t24_value = /*l*/ ctx[2].desc + "")) set_data(t24, t24_value);
    			if (dirty[0] & /*l*/ 4 && t30_value !== (t30_value = /*l*/ ctx[2].price + "")) set_data(t30, t30_value);
    			if (dirty[0] & /*l*/ 4 && t32_value !== (t32_value = /*l*/ ctx[2].qty + "")) set_data(t32, t32_value);
    			if (dirty[0] & /*l*/ 4 && t34_value !== (t34_value = /*l*/ ctx[2].amt + "")) set_data(t34, t34_value);

    			if (dirty[0] & /*price, q, qty*/ 26) {
    				each_value = /*q*/ ctx[1].desc;
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key_2, 1, ctx, each_value, each2_lookup, tbody, destroy_block, create_each_block, null, get_each_context);
    			}

    			if (dirty[0] & /*l*/ 4 && t39_value !== (t39_value = /*l*/ ctx[2].total + "")) set_data(t39, t39_value);
    			if (dirty[0] & /*q*/ 2 && t41_value !== (t41_value = /*price*/ ctx[3](/*q*/ ctx[1].total) + "")) set_data(t41, t41_value);
    			if (dirty[0] & /*l*/ 4 && t45_value !== (t45_value = /*l*/ ctx[2].cur + "")) set_data(t45, t45_value);

    			if (dirty[0] & /*q*/ 2 && /*q*/ ctx[1].cur !== td11.textContent) {
    				td11.textContent = /*q*/ ctx[1].cur;
    			}

    			if (dirty[0] & /*l*/ 4 && t48_value !== (t48_value = /*l*/ ctx[2].rSign + "")) set_data(t48, t48_value);
    			if (dirty[0] & /*l*/ 4 && t51_value !== (t51_value = /*l*/ ctx[2].thank + "")) set_data(t51, t51_value);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div0);

    			for (let i = 0; i < each_blocks_2.length; i += 1) {
    				each_blocks_2[i].d();
    			}

    			for (let i = 0; i < each_blocks_1.length; i += 1) {
    				each_blocks_1[i].d();
    			}

    			if (detaching) detach(t1);
    			if (detaching) detach(div21);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			if (detaching) detach(t52);
    			if (detaching) detach(div22);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { data } = $$props;
    	let l = data[""].label[""];
    	let q = data[""].q;

    	const price = num => {
    		const str = Number(num).toLocaleString(undefined, {
    			minimumFractionDigits: 2,
    			maximumFractionDigits: 2
    		});

    		return num ? str : "";
    	};

    	const qty = num => {
    		const str = Number(num).toLocaleString();
    		return num ? str : "";
    	};

    	const addItem = () => {
    		q.desc.push("");
    		q.price.push("");
    		q.qty.push("");
    		$$invalidate(1, q);
    	};

    	const removeItem = () => {
    		q.desc.pop();
    		q.price.pop();
    		q.qty.pop();
    		$$invalidate(1, q);
    	};

    	onMount(() => {
    		const s = new URLSearchParams(location.search);
    		let obj = q;

    		Object.keys(q).forEach(key => {
    			const values = s.getAll(key);

    			if (values.length > 0) {
    				if (Array.isArray(q[key])) {
    					obj[key] = values;
    					return;
    				}

    				obj[key] = values[0];
    			}
    		});

    		$$invalidate(1, q = { ...data[q.lang].q, ...obj });
    	});

    	const click_handler = lng => {
    		$$invalidate(1, q.lang = lng, q);
    	};

    	const click_handler_1 = dc => {
    		$$invalidate(1, q.doc = dc, q);
    	};

    	function p0_input_handler() {
    		q.rName = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p1_input_handler() {
    		q.rAddress = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p2_input_handler() {
    		q.rId = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p3_input_handler() {
    		q.no = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p4_input_handler() {
    		q.date = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p5_input_handler() {
    		q.name = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p6_input_handler() {
    		q.address = this.textContent;
    		$$invalidate(1, q);
    	}

    	function p7_input_handler() {
    		q.id = this.textContent;
    		$$invalidate(1, q);
    	}

    	function td0_input_handler(i) {
    		q.desc[i] = this.textContent;
    		$$invalidate(1, q);
    	}

    	const focus_handler = (i, e) => e.target.textContent = q.price[i];
    	const input_handler = (i, e) => $$invalidate(1, q.price[i] = e.target.textContent, q);
    	const blur_handler = (i, e) => e.target.textContent = price(q.price[i]);
    	const focus_handler_1 = (i, e) => e.target.textContent = q.qty[i];
    	const input_handler_1 = (i, e) => $$invalidate(1, q.qty[i] = e.target.textContent, q);
    	const blur_handler_1 = (i, e) => e.target.textContent = qty(q.qty[i]);

    	function td11_input_handler() {
    		q.cur = this.textContent;
    		$$invalidate(1, q);
    	}

    	const click_handler_2 = () => window.print();

    	$$self.$$set = $$props => {
    		if ('data' in $$props) $$invalidate(0, data = $$props.data);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*q*/ 2) {
    			$$invalidate(
    				1,
    				q.amt = q.price.map((pr, i) => {
    					const num = Number(pr) * Number(q.qty[i]);
    					return num ? num : "";
    				}),
    				q
    			);
    		}

    		if ($$self.$$.dirty[0] & /*q*/ 2) {
    			$$invalidate(
    				1,
    				q.total = q.amt.reduce(
    					(a, b) => {
    						const num = Number(a) + Number(b);
    						return num ? num : "";
    					},
    					0
    				),
    				q
    			);
    		}

    		if ($$self.$$.dirty[0] & /*q*/ 2) {
    			{

    				Object.keys(q).forEach(key => {
    					const values = q[key];

    					if (values) {
    						if (Array.isArray(values)) {
    							values.forEach(value => {
    							});

    							return;
    						}
    					}
    				});
    			}
    		}

    		if ($$self.$$.dirty[0] & /*data, q*/ 3) {
    			$$invalidate(2, l = {
    				...data[q.lang].label[""],
    				...data[q.lang].label[q.doc]
    			});
    		}
    	};

    	return [
    		data,
    		q,
    		l,
    		price,
    		qty,
    		addItem,
    		removeItem,
    		click_handler,
    		click_handler_1,
    		p0_input_handler,
    		p1_input_handler,
    		p2_input_handler,
    		p3_input_handler,
    		p4_input_handler,
    		p5_input_handler,
    		p6_input_handler,
    		p7_input_handler,
    		td0_input_handler,
    		focus_handler,
    		input_handler,
    		blur_handler,
    		focus_handler_1,
    		input_handler_1,
    		blur_handler_1,
    		td11_input_handler,
    		click_handler_2
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, { data: 0 }, null, [-1, -1]);
    	}
    }

    let data = {
    	"": {
    		label: {
    			"": {
    				title: "Cash Sale",
    				no: "No",
    				date: "Date",
    				customer: "Customer",
    				name: "Name",
    				address: "Address",
    				id: "Identification No",
    				desc: "Description",
    				price: "Unit Price",
    				qty: "Quantity",
    				amt: "Amount",
    				total: "Total",
    				cur: "Currency",
    				rSign: "Collector",
    				thank: "Thank you"
    			},
    			receipt: {
    				title: "Receipt",
    				name: "Received from"
    			}
    		},
    		q: {
    			lang: "",
    			doc: "",
    			cur: "",
    			rName: "",
    			rAddress: "",
    			rId: "",
    			date: "",
    			no: "",
    			name: "",
    			address: "",
    			id: "",
    			desc: ["", "", "", "", "", "", "", "", ""],
    			price: ["", "", "", "", "", "", "", "", ""],
    			qty: ["", "", "", "", "", "", "", "", ""]
    		}
    	},
    	th: {
    		label: {
    			"": {
    				title: "บิลเงินสด",
    				no: "เลขที่",
    				date: "วันที่",
    				customer: "ลูกค้า",
    				name: "ชื่อ",
    				address: "ที่อยู่",
    				id: "เลขประจำตัว",
    				desc: "รายการ",
    				price: "หน่วยละ",
    				qty: "จำนวน",
    				amt: "จำนวนเงิน",
    				total: "รวมเงิน",
    				cur: "สกุลเงิน",
    				rSign: "ผู้รับเงิน",
    				thank: "ขอขอบคุณท่านที่อุดหนุน"
    			},
    			receipt: {
    				title: "ใบเสร็จรับเงิน",
    				name: "รับเงินจาก"
    			}
    		},
    		q: {
    			lang: "th",
    			doc: "",
    			cur: "บาท",
    			rName: "",
    			rAddress: "",
    			rId: "",
    			date: "",
    			no: "",
    			name: "",
    			address: "",
    			id: "",
    			desc: ["", "", "", "", "", "", "", "", ""],
    			price: ["", "", "", "", "", "", "", "", ""],
    			qty: ["", "", "", "", "", "", "", "", ""]
    		}
    	}
    };
    const app = new App({
    	target: document.getElementById("_app"),
    	props: {
    		data
    	}
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
