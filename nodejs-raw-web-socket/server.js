import crypto from 'node:crypto';
import { createServer } from 'node:http';
const PORT = 1337;
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const server = createServer((request, response) => {
	response.writeHead(200);
	response.end('hy there.');
}).listen(PORT, () => console.log('server running at ', PORT));

server.on('upgrade', onSocketUpgrade);

function onSocketUpgrade(req, socket, head) {
	// sec-websocket-key
	const { 'sec-websocket-key': webClientSocketKey } = req.headers;

	console.log(`${webClientSocketKey} connected.`);

	const headers = prepareHandshakeHeaders(webClientSocketKey);
	socket.write(headers);
}

function prepareHandshakeHeaders(id) {
	const acceptKey = createSocketAccept(id);
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

function createSocketAccept(id) {
	const shaone = crypto.createHash('sha-1');
	shaone.update(id + WEBSOCKET_MAGIC_STRING_KEY);
	return shaone.digest('base64');
}

errorHandling();

function errorHandling() {
	['uncaughtException', 'unhandledRejection'].forEach((event) =>
		process.on(event, (err) => {
			console.error(
				`something bad happened! event: ${err}, msg: ${err.stack | err}`
			);
		})
	);
}
