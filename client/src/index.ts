import { EventType } from "./communication/event";
import { EventRequest } from "./communication/request";
import { EventResponse } from "./communication/response";

import { EventEmitter } from "events";
import { Constants } from "./constants";
import { Version } from "./structs/vendor/version";
import { BuildInfo } from "./structs/vendor/buildInfo";
import { BoardInfo } from "./structs/vendor/boardInfo";
import { EventBulkInterrupt } from "./communication/bulkInterrupt";
import { FeatureSet } from "./structs/vendor/featureSet";
import { FlashBinaryEnd } from "./structs/vendor/flashBinaryEnd";

//class ResponseEmitter extends EventEmitter {}
//const emitter = new ResponseEmitter();

export class Client {
	// Internal emitter used for responses from the worker
	private emitter: EventEmitter;
	// Public emitter used to that downstream code can "subscribe" to bulk (streaming) events.
	private publicEmitter;
	private worker: Worker;

	constructor() {
		this.emitter = new EventEmitter();
		this.publicEmitter = new EventEmitter();

		this.worker = new Worker(
			new URL(/* webpackChunkName: "worker" */ "./workers/webusb.ts", import.meta.url)
		);
		this.worker.onmessage = this.onMessage;

		// Create a listener for a bulk response
		this.emitter.on("response_bulk", (res: EventBulkInterrupt) => {
			// Emit a message (on the public emitter) corresponding to the id embedded in the event.
			this.publicEmitter.emit(`${res.id}`, res.data);
		});
	}

	// Getter for the public emitter
	getEmitter() {
		return this.publicEmitter;
	}

	private makeResponsePromise(id: string): Promise<EventResponse> {
		return new Promise((resolve, reject) => {
			this.emitter.once(`response_${id}`, (res: EventResponse) => {
				resolve(res);
			});
		});
	}

	// Make a request to the worker, wait for a response and check the status code.
	private async makeRequest(req: EventRequest) {
		this.worker.postMessage(req);
		const res = await this.makeResponsePromise(req.id);

		if (res.status == 0) {
			return res;
		} else {
			return Promise.reject(res.status);
		}
	}

	private async workerCreateClient() {
		const req = new EventRequest(EventType.NEW_CLIENT);
		const res = await this.makeRequest(req);
		console.log("Created client!");
	}

	private async workerHasDevice() {
		const req = new EventRequest(EventType.HAS_DEVICE);
		const res = await this.makeRequest(req);
		if (typeof res.data == "boolean") {
			return res.data;
		} else {
			throw new Error("Worker returned invalid datatype. Expecting boolean.");
		}
	}

	// requestDevice is only accessible from the main thread
	// After getting a device the [worker] navigator.usb.devices[] will populate
	private async requestDevice() {
		// 1. Check to see if the worker already has a device.
		const hasDevice = await this.workerHasDevice();
		if (!hasDevice) {
			const device = await navigator.usb.requestDevice({
				filters: [{ vendorId: Constants.USB_VENDOR_ID }],
			});
			if (device != null) {
				console.log("Found device!");
				await this.workerSendDevice(device);
			}
		}
	}

	// Now we have to send the PID and VID to the worker.
	// Inspired by example @ https://github.com/odejesush/webusb-on-workers/blob/8bec09744a26c83e7931f21d506035b6e5dbe327/EXPLAINER.md
	private async workerSendDevice(device: USBDevice) {
		const req = new EventRequest(EventType.RECV_DEVICE_INFO, {
			vendorId: device.vendorId,
			productId: device.productId,
		});
		await this.makeRequest(req);
		console.log("Sent device info to worker.");
	}

	private async workerOpenDevice() {
		const req = new EventRequest(EventType.OPEN_DEVICE);
		await this.makeRequest(req);
		console.log("Opened usb device.");
	}

	private async workerFindInterface() {
		const req = new EventRequest(EventType.FIND_INTERFACE);
		const res = await this.makeRequest(req);
		// Check return datatype?
		// Not returned though, only used for debugging.
		console.log("Found interface", res.data);
	}

	private async workerClaimInterface() {
		const req = new EventRequest(EventType.CLAIM_INTERFACE);
		await this.makeRequest(req);
		console.log("Claimed interface");
	}

	async setup() {
		// TODO: Instruct the worker to create a WorkerClient if one does not already exist
		// Or just do it in 'constructor'
		await this.workerCreateClient();

		await this.requestDevice();

		// We have a device now, let's open it!
		await this.workerOpenDevice();

		await this.workerFindInterface();

		await this.workerClaimInterface();
	}

	private onMessage = (ev: MessageEvent<EventResponse>) => {
		this.emitter.emit(`response_${ev.data.req.id}`, ev.data);
	};

	async go() {
		await this.setup();
	}

	// Device attributes obtained through vendor requests
	// Caching is handled by the worker to avoid sending non-clonable objects (USBTransferInResult) in messages.
	// The worker sends a object representation of the corresponding 'struct' class.
	// We can then reconstruct an instance of the corresponding class using this object representation.

	async getVersion() {
		const req = new EventRequest(EventType.GET_VERSION);
		const res = await this.makeRequest(req);
		// Reconstruct a new instance using the object representation returned in the message.
		return new Version(null, res.data);
	}

	async getBuildInfo() {
		const req = new EventRequest(EventType.GET_BUILD_INFO);
		const res = await this.makeRequest(req);
		// Reconstruct a new instance using the object representation returned in the message.
		return new BuildInfo(null, res.data);
	}

	async getBoardInfo() {
		const req = new EventRequest(EventType.GET_BOARD_INFO);
		const res = await this.makeRequest(req);
		// Reconstruct a new instance using the object representation returned in the message.
		return new BoardInfo(null, res.data);
	}

	async getFeatureSet() {
		const req = new EventRequest(EventType.GET_FEATURE_SET);
		const res = await this.makeRequest(req);
		// Reconstruct a new instance using the object representation returned in the message.
		return new FeatureSet(null, res.data);
	}

	async getFlashBinaryEnd() {
		const req = new EventRequest(EventType.GET_FLASH_BINARY_END);
		const res = await this.makeRequest(req);
		// Reconstruct a new isntance using the object representation returned in the message.
		return new FlashBinaryEnd(null, res.data);
	}

	async getBulkListenerStatus() {
		const req = new EventRequest(EventType.BULK_ENDPOINT_LISTENER_STATUS);
		const res = await this.makeRequest(req);
		return res.data;
	}

	async setBulkListenerStatus(value: boolean) {
		const req = new EventRequest(EventType.BULK_ENDPOINT_LISTENER_STATUS, value);
		const res = await this.makeRequest(req);
		return res.data;
	}
}
