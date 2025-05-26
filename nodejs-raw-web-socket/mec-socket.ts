import { createHash } from 'node:crypto';
import { IncomingMessage } from 'node:http';
import Stream from 'node:stream';

export const SocketConstants = {
	WEBSOCKET_MAGIC_STRING_KEY: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
	FIRST_BIT: 128,
	SEVEN_BITS_INTEGER_MARKER: 125,
	SIXTEEN_BITS_INTEGER_MARKER: 126,
	MASK_KEY_BYTES_LENGTH: 4,
	OPCODE_TEXT: 0x01,
	MAXIMUM_SIXTEEN_BITS_INTEGER: 2 ** 16,
	SIXTYFOUR_BITS_INTEGER_MARKER: 127,
};

export class MecSocket {
	private static prepareHandshakeHeaders(id: string) {
		const acceptKey = MecSocket.createSocketAccept(id);
		const headers = [
			'HTTP/1.1 101 Switching Protocols',
			'Upgrade: websocket',
			'Connection: Upgrade',
			`Sec-WebSocket-Accept: ${acceptKey}`,
			'',
		]
			.map((line) => line.concat('\r\n'))
			.join('');
		return headers;
	}
	private static createSocketAccept(id: string) {
		const shaone = createHash('sha-1');
		shaone.update(id + SocketConstants.WEBSOCKET_MAGIC_STRING_KEY);
		return shaone.digest('base64');
	}

	private static onSocketReadable(socket: Stream.Duplex) {
		// 1 - 1byte - 8bits
		// consume optcode (first byte)
		socket.read(1);
		const [markerAndPayloadLength] = socket.read(1);
		// Because the first bit is always 1 for client-server messages
		// you can subtract one bit (128 or 10000000) from MecSocket byte to get rid of the MASK bit
		const lengthIndicatorInBits =
			markerAndPayloadLength - SocketConstants.FIRST_BIT;

		let messageLength = 0;

		if (lengthIndicatorInBits <= SocketConstants.SEVEN_BITS_INTEGER_MARKER) {
			messageLength = lengthIndicatorInBits;
		} else if (
			lengthIndicatorInBits === SocketConstants.SIXTEEN_BITS_INTEGER_MARKER
		) {
			// unsigned, big-endian 16-bit integer [0-65k]
			messageLength = socket.read(2).readUint16BE(0);
		} else {
			throw new Error(
				"your message is too long! we don't handle 64-bit messages."
			);
		}

		const maskkey = socket.read(SocketConstants.MASK_KEY_BYTES_LENGTH);

		const encoded = socket.read(messageLength);
		const decoded = MecSocket.unmask(encoded, maskkey);
		const received = decoded.toString('utf-8');

		const data = JSON.parse(received);
		console.log('message received', data);

		const message = JSON.stringify({
			message: data,
			at: new Date().toISOString(),
		});
		MecSocket.sendMessage(message, socket);
	}

	private static unmask(encodedBuffer: Buffer, maskKey: Buffer): Buffer {
		// because the mask key has only four bytes
		// we do index % 4 === 0, 1, 2, 3 = index bits needed to decode the message

		// XOR ^
		//

		// (21).toString(2).padStart(8, "0") - 0 1 0 1 0 1
		// (53).toString(2).padStart(8, "0") - 1 1 0 1 0 1
		// ^                                 - 1 0 0 0 0 0
		// String.fromCharCode()
		// (21 ^ 53).toString(2).padStart(8, "0") = 0 0 1 0 0 0 0 0

		const fillWithRightZeros = (t) => t.padStart(8, '0');

		const toBinary = (t) => fillWithRightZeros(t.toString(2));

		const fromBinaryToDecimal = (t) => parseInt(toBinary(t), 2);

		const getCharFromBinary = (t) =>
			String.fromCharCode(fromBinaryToDecimal(t));

		const finalBuffer = Buffer.from(encodedBuffer);
		for (let i = 0; i < encodedBuffer.length; i++) {
			finalBuffer[i] =
				encodedBuffer[i] ^ maskKey[i % SocketConstants.MASK_KEY_BYTES_LENGTH];
			const logger = {
				unmaskingCalc: `${toBinary(encodedBuffer[i])} ^ ${toBinary(
					maskKey[i % SocketConstants.MASK_KEY_BYTES_LENGTH]
				)} = ${toBinary(finalBuffer[i])}`,
				decoded: getCharFromBinary(finalBuffer[i]),
			};
			console.log(logger);
		}
		return finalBuffer;
	}

	private static sendMessage(message: string, socket: Stream.Duplex) {
		const dataFrame = MecSocket.prepareMessage(message);
		socket.write(dataFrame);
	}

	private static prepareMessage(message: string): Buffer<ArrayBuffer> {
		const msg = Buffer.from(message);
		const messageSize = msg.length;

		let dataFrameBuffer;

		// 0x80 === 128 in binary
		// '0x' + Math.abs(128).toString(16);
		const firstByte = 0x80 | SocketConstants.OPCODE_TEXT; // single frame + text
		if (messageSize <= SocketConstants.SEVEN_BITS_INTEGER_MARKER) {
			const bytes = [firstByte];
			dataFrameBuffer = Buffer.from(bytes.concat(messageSize));
		} else if (messageSize <= SocketConstants.MAXIMUM_SIXTEEN_BITS_INTEGER) {
			const offsetFourBytes = 4;
			const target = Buffer.allocUnsafe(offsetFourBytes);

			target[0] = firstByte;
			target[1] = SocketConstants.SIXTEEN_BITS_INTEGER_MARKER | 0x00; // just to know the mask;

			target.writeUint16BE(messageSize, 2); // content length is 2 bytes

			dataFrameBuffer = target;
			// alloc 4bytes
			// [0] - 128 + 1 = 10000001 = 0x81 fin + opcode
			// [1] - 126 + 0 = payload length marker + mask indicator
			// [2] 0- content length
			// [3] 171 - content length
			// [4 -...] - all remaining bytes | the message itself
		} else {
			throw new Error('message too long buddy :(');
		}

		const totalLength = dataFrameBuffer.byteLength + messageSize;
		const dataFrameResponse = MecSocket.concat(
			[dataFrameBuffer, msg],
			totalLength
		);

		return dataFrameResponse;
	}
	private static concat(bufferList: ArrayLike<number>[], totalLength: number) {
		const target = Buffer.allocUnsafe(totalLength);
		let offset = 0;
		for (const buffer of bufferList) {
			target.set(buffer, offset);
			offset += buffer.length;
		}
		return target;
	}

	static onUpgrade(
		req: IncomingMessage,
		socket: Stream.Duplex,
		head: Buffer
	): void {
		// sec-websocket-key
		const { 'sec-websocket-key': webClientSocketKey } = req.headers;

		console.log(`${webClientSocketKey} connected.`);

		const headers = MecSocket.prepareHandshakeHeaders(webClientSocketKey!!);
		socket.write(headers);

		socket.on('readable', () => MecSocket.onSocketReadable(socket));
	}
}
