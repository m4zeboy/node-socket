import { createServer } from 'node:http';

const PORT = 1337;

const server = createServer((request, response) => {
	response.writeHead(200);
	response.end('hy there.');
}).listen(PORT, () => console.log('server running at ', PORT));

server.on('upgrade', (req, socket, head) => {
	console.log({ req, socket, head });
});

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
