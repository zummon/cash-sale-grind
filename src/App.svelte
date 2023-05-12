<script>
	import { onMount } from "svelte";
	export let data;

	let l = data[""].label[""];
	let q = data[""].q;

	const price = num => {
	  const str = Number(num).toLocaleString(undefined, {
	    minimumFractionDigits: 2,
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
	  q = q;
	};
	const removeItem = () => {
	  q.desc.pop();
	  q.price.pop();
	  q.qty.pop();
	  q = q;
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
	  q = { ...data[q.lang].q, ...obj };
	});

	$: l = {
	  ...data[q.lang].label[""],
	  ...data[q.lang].label[q.doc]
	};
	$: q.amt = q.price.map((pr, i) => {
	  const num = Number(pr) * Number(q.qty[i]);
	  return num ? num : "";
	});
	$: q.total = q.amt.reduce((a, b) => {
	  const num = Number(a) + Number(b);
	  return num ? num : "";
	}, 0);
</script>

<div class="flex flex-wrap justify-center items-center my-4 print:hidden">
	{#each Object.keys(data) as lng, i (`lang-${i}`)}
		<button class="font-bold p-2.5 {q.lang === lng ? "text-[#c34a36] bg-white cursor-default" : "text-white bg-[#c34a36] cursor-pointer"}" on:click={() => {
			q.lang = lng
			}}>
			{lng =='th' ? 'ไทย' : 'Eng'}
		</button>
	{/each}
	{#each Object.keys(data[q.lang].label) as dc, i (`doc-${i}`)}
		<button class="font-bold p-2.5 {q.doc === dc ? "text-[#c34a36] bg-white cursor-default" : "text-white bg-[#c34a36] cursor-pointer"}" on:click={() => {
			q.doc = dc
			}}>
			{data[q.lang].label[dc].title}
		</button>
	{/each}
</div>

<div class="text-sm text-[#4b4453] bg-white py-6 px-3 max-w-[40rem] mx-auto print:max-w-none print:mx-0" style="font-family: 'Lucida Sans', 'Lucida Sans Regular', 'Lucida Grande', 'Lucida Sans Unicode', Geneva, Verdana, sans-serif;">
	<div class="flex mb-4">
		<h1 class="mr-4 ml-4 p-4 text-3xl font-bold">{l.title}</h1>
		<div class="flex-grow text-center border-2 rounded-lg border-[#b0a8b9] p-1.5">
			<p class="break-all mb-2" contenteditable="true" bind:textContent={q.rName}></p>
			<p class="break-all mb-2" contenteditable="true" bind:textContent={q.rAddress}></p>
			<p class="break-all" contenteditable="true" bind:textContent={q.rId}></p>
		</div>
	</div>
	<div class="flex">
		<div class="mr-4 ml-4 flex-[1]">
			<div class="flex mb-4 border-2 rounded-lg border-[#b0a8b9] p-1.5">
				<div class="mr-2">{l.no}</div>
				<p class="break-all flex-grow" contenteditable="true" bind:textContent={q.no}></p>
			</div>
			<div class="flex mb-4 border-2 rounded-lg border-[#b0a8b9] p-1.5">
				<div class="mr-2">{l.date}</div>
				<p class="break-all flex-grow" contenteditable="true" bind:textContent={q.date}></p>
			</div>
		</div>
		<div class="flex-[2]">
			<h3 class="text-center text-lg font-semibold">{l.customer}</h3>
			<div class="flex mb-4">
				<div class="mr-2">{l.name}</div>
				<p class="break-all flex-grow font-bold border-b-2 border-[#b0a8b9]" contenteditable="true" bind:textContent={q.name}></p>
			</div>
			<div class="flex mb-4">
				<div class="mr-2">{l.address}</div>
				<p class="break-all flex-grow font-bold border-b-2 border-[#b0a8b9]" contenteditable="true" bind:textContent={q.address}></p>
			</div>
			<div class="flex mb-4">
				<div class="mr-2">{l.id}</div>
				<p class="break-all flex-grow font-bold border-b-2 border-[#b0a8b9]" contenteditable="true" bind:textContent={q.id}></p>
			</div>
		</div>
	</div>
	<table class="mb-4 w-full">
		<thead>
			<tr class="font-bold">
				<td class="p-2 break-all border-b-2 border-[#b0a8b9]">{l.desc}
					<button class="font-bold text-white bg-[#c34a36] text-[1.375rem] cursor-pointer p-2.5 print:hidden" on:click={addItem}>+</button>
					<button class="font-bold text-white bg-[#c34a36] text-[1.375rem] cursor-pointer p-2.5 print:hidden" on:click={removeItem}>-</button>
				</td>
				<td class="p-2 text-center border-b-2 border-[#b0a8b9] whitespace-nowrap w-2">{l.price}</td>
				<td class="p-2 text-center border-b-2 border-[#b0a8b9] whitespace-nowrap w-2">{l.qty}</td>
				<td class="p-2 text-center border-b-2 border-[#b0a8b9] whitespace-nowrap w-2">{l.amt}</td>
			</tr>
		</thead>
		<tbody>
			{#each q.desc as _, i (`item-${i}`)}	
				<tr class="even:bg-[#f4f4f4]">
					<td class="p-2 border-r-2 border-[#b0a8b9] break-all" contenteditable="true" bind:textContent={q.desc[i]}></td>
					<td class="p-2 border-r-2 border-[#b0a8b9] text-center" contenteditable="true"
						on:focus={e => e.target.textContent = q.price[i]}
						on:input={e => q.price[i] = e.target.textContent}
						on:blur={e => e.target.textContent = price(q.price[i])}
					>
						{price(q.price[i])}
					</td>
					<td class="p-2 border-r-2 border-[#b0a8b9] text-center" contenteditable="true" 
						on:focus={e => e.target.textContent = q.qty[i]}
						on:input={e => q.qty[i] = e.target.textContent}
						on:blur={e => e.target.textContent = qty(q.qty[i])}
					>
						{qty(q.qty[i])}
					</td>
					<td class="p-2 text-right">{price(q.amt[i])}</td>
				</tr>
			{/each}
		</tbody>
		<tfoot>
			<tr class="font-bold">
				<td></td>
				<td class="p-2 border-r-2 border-[#b0a8b9]"></td>
				<td class="p-2 border-r-2 border-b-2 border-[#b0a8b9] text-right whitespace-nowrap">{l.total}</td>
				<td class="p-2 border-b-2 border-[#b0a8b9] text-right whitespace-nowrap">{price(q.total)}</td>
			</tr>
			<tr>
				<td></td>
				<td></td>
				<td class="p-2 text-right whitespace-nowrap">{l.cur}</td>
				<td class="p-2 text-right whitespace-nowrap" contenteditable="true" bind:textContent={q.cur}></td>
			</tr>
		</tfoot>
	</table>
	<div class="flex">
		<div class="flex-[2] mr-4 ml-4">
			<div class="flex mb-4">
				<div class="mr-2 font-bold">{l.rSign}</div>
				<p class="break-all flex-grow border-b-2 border-[#b0a8b9]" contenteditable="true"></p>
			</div>
		</div>
		<div class="flex-[1] font-bold text-right">{l.thank}</div>
	</div>
</div>

<div class="flex flex-wrap justify-center items-center my-4 print:hidden">
	<button class="font-bold text-white bg-[#c34a36] cursor-pointer p-2.5" on:click={() => window.print()}>
	Print
	</button>
</div>

