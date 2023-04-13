import App from "./App.svelte";
import "./tailwind.css";

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
        thank: "Thank you",
      },
      receipt: {
        title: "Receipt",
        name: "Received from",
      },
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
      qty: ["", "", "", "", "", "", "", "", ""],
    },
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
        thank: "ขอขอบคุณท่านที่อุดหนุน",
      },
      receipt: {
        title: "ใบเสร็จรับเงิน",
        name: "รับเงินจาก",
      },
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
      qty: ["", "", "", "", "", "", "", "", ""],
    },
  },
};
const app = new App({
  target: document.getElementById("_app"),
  props: {
    data,
  },
});

export default app;
