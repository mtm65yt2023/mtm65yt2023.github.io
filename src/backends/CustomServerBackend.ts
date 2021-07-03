import EventEmitter from "events";
import ch from "chalk";
import util from "util";
import ws from "ws";

import * as skeldjs from "@skeldjs/core";
import { Code2Int } from "@skeldjs/util";

import { CUSTOM_SERVER_PORT } from "../consts";
import { CustomServerBackendModel } from "../types/models/Backends";
import { BackendAdapter, LogMode } from "./Backend";
import { GameState } from "../types/enums/GameState";
import { PlayerFlag } from "../types/enums/PlayerFlags";
import { GameFlag } from "../types/enums/GameFlags";
import logger from "../util/logger";
import { GameSettings } from "../types/models/ClientOptions";
import { getVentName } from "../util/getVentName";
import { GameMap } from "@skeldjs/core";

const chalk = new ch.Instance({ level: 2 });

export interface RecordedPlayer {
	clientId: number;
	name: string;
	color: number;
	hat: number;
	skin: number;
}

export default class CustomServerBackend extends BackendAdapter {
	socket?: ws;
	gotHello: boolean;

	eventEmitter: EventEmitter;
	backendModel: CustomServerBackendModel;

	recordedPlayers: Map<number, RecordedPlayer>;

	settings: GameSettings;

	constructor(backendModel: CustomServerBackendModel) {
		super();

		this.gotHello = false;

		this.eventEmitter = new EventEmitter();
		this.backendModel = backendModel;
		this.gameID = this.backendModel.gameCode;

		this.recordedPlayers = new Map();

		this.settings = {
			map: GameMap.TheSkeld,
			crewmateVision: 1,
		};
	}

	log(mode: LogMode, format: string, ...params: unknown[]): void {
		const formatted = util.format(format, ...params);

		logger[mode](
			chalk.grey(
				"[" + this.backendModel.gameCode + "@" + this.backendModel.ip + "]"
			),
			formatted
		);
	}

	getOrCreatePlayer(clientId: number): RecordedPlayer {
		const player = this.recordedPlayers.get(clientId);

		if (player) {
			return player;
		}

		const newPlayer: RecordedPlayer = {
			clientId,
			name: "",
			color: 0,
			hat: skeldjs.Hat.None,
			skin: skeldjs.Skin.None,
		};

		this.recordedPlayers.set(clientId, newPlayer);
		return newPlayer;
	}

	fmtPlayer(clientId: number): string {
		const player = this.getOrCreatePlayer(clientId);

		const colour = player.color;
		const name = player.name || "<No Name>";
		const id = clientId || "<No ID>";

		const consoleClr: ch.Chalk = skeldjs.ColorCodes[
			colour as keyof typeof skeldjs.ColorCodes
		]?.highlightHex
			? chalk.hex(skeldjs.ColorCodes[colour].highlightHex)
			: chalk.gray;

		return consoleClr(name) + " " + chalk.grey("(" + id + ")");
	}

	getVentName(ventid: number): string | null {
		return getVentName(this.settings.map, ventid);
	}

	initialize(): void {
		this.log(
			LogMode.Info,
			"Connecting to " + this.backendModel.ip + ":" + CUSTOM_SERVER_PORT + ".."
		);
		this.socket = new ws(
			"ws://" + this.backendModel.ip + ":" + CUSTOM_SERVER_PORT
		);

		this.socket.on("open", () => {
			this.log(LogMode.Info, "Socket open.");
			this.socket?.send(
				JSON.stringify({
					op: TransportOp.Hello,
					d: {
						gameCode: Code2Int(this.backendModel.gameCode),
					},
				})
			);
		});

		this.socket.on("error", (err) => {
			this.log(
				LogMode.Warn,
				"An error occurred while attempting to connect to server:"
			);
			console.log(err);

			this.destroy();
		});

		this.socket.on("message", (buf) => {
			const data = buf.toString("utf8");
			try {
				const json = JSON.parse(data);

				try {
					if (json.d.gameCode === Code2Int(this.backendModel.gameCode)) {
						this.eventEmitter.emit(json.op, json.d);
					}
				} catch (e) {
					this.log(
						LogMode.Warn,
						"An error occurred while processing websocket message."
					);
					console.log(e);
				}
			} catch (e) {
				this.log(
					LogMode.Warn,
					"Received bad websocket message from %s: %s",
					this.backendModel.ip,
					data
				);
			}
		});

		this.eventEmitter.on(TransportOp.Error, (data) => {
			this.log(LogMode.Error, "An error occurred:", data.error);
			this.destroy();
		});

		this.eventEmitter.on(TransportOp.Destroy, () => {
			this.log(LogMode.Info, "The server destroyed the room.");
			this.destroy();
		});

		this.eventEmitter.on(TransportOp.HostUpdate, (data) => {
			this.log(
				LogMode.Info,
				"Host changed to %s",
				this.fmtPlayer(data.clientId)
			);

			this.emitHostChange(data.clientId);
		});

		this.eventEmitter.on(TransportOp.PlayerMove, (data) => {
			if (process.env.NODE_ENV !== "production") {
				this.log(
					LogMode.Info,
					"%s moved to X: %s, Y: %s",
					this.fmtPlayer(data.clientId),
					data.x,
					data.y
				);
			}

			this.emitPlayerPose(data.clientId, data);
		});

		this.eventEmitter.on(TransportOp.PlayerUpdate, (data) => {
			const player = this.getOrCreatePlayer(data.clientId);

			if ("name" in data) {
				player.name = data.name;
				this.log(
					LogMode.Info,
					"%s set their name to %s",
					this.fmtPlayer(data.clientId),
					player.name
				);
				this.emitPlayerName(data.clientId, player.name);
			}

			if ("color" in data) {
				player.color = data.color;
				this.log(
					LogMode.Info,
					"%s set their name to %s",
					this.fmtPlayer(data.clientId),
					skeldjs.Color[player.color]
				);

				this.emitPlayerColor(data.clientId, player.color);
			}

			if ("hat" in data) {
				player.hat = data.hat;
				this.emitPlayerHat(data.clientId, player.hat);
			}

			if ("skin" in data) {
				player.skin = data.skin;
				this.emitPlayerSkin(data.clientId, player.skin);
			}
		});

		this.eventEmitter.on(TransportOp.SettingsUpdate, (data) => {
			if ("map" in data || "crewmateVision" in data) {
				if ("map" in data) {
					this.settings.map = data.map;
					this.log(LogMode.Info, "Map set to " + skeldjs.GameMap[data.map]);
				}
				if ("crewmateVision" in data) {
					this.settings.crewmateVision = data.crewmateVision;
					this.log(
						LogMode.Info,
						"Crewmate vision set to " + data.crewmateVision
					);
				}
			}
			this.emitSettingsUpdate(data);
		});

		this.eventEmitter.on(TransportOp.GameStart, () => {
			this.log(LogMode.Info, "Game started.");
			this.emitGameState(GameState.Game);
		});

		this.eventEmitter.on(TransportOp.GameEnd, () => {
			this.log(LogMode.Info, "Game ended.");
			this.emitGameState(GameState.Lobby);
		});

		this.eventEmitter.on(TransportOp.MeetingStart, () => {
			this.log(LogMode.Info, "Meeting started.");
			this.emitGameState(GameState.Meeting);
		});

		this.eventEmitter.on(TransportOp.MeetingEnd, (data) => {
			this.log(LogMode.Info, "Meeting ended");
			if (data.ejectedClientId) {
				this.emitPlayerFlags(data.ejectedClientId, PlayerFlag.IsDead, true);
				this.log(
					LogMode.Info,
					"%s was voted off.",
					this.fmtPlayer(data.ejectedClientId)
				);
			} else {
				this.log(LogMode.Info, "No one was voted off.");
			}

			this.emitGameState(GameState.Game);
		});

		this.eventEmitter.on(TransportOp.PlayerKill, (data) => {
			const player = this.getOrCreatePlayer(data.clientId);
			this.log(LogMode.Info, "%s was murdered.", player);
			this.emitPlayerFlags(data.clientId, PlayerFlag.IsDead, true);
		});

		this.eventEmitter.on(TransportOp.ImpostorsUpdate, (data) => {
			for (const [clientId] of this.recordedPlayers) {
				this.emitPlayerFlags(clientId, PlayerFlag.IsImpostor, false);
			}
			for (const clientId of data.clientIds) {
				this.log(
					LogMode.Info,
					"%s was made impostor.",
					this.fmtPlayer(clientId)
				);
				this.emitPlayerFlags(clientId, PlayerFlag.IsImpostor, true);
			}
		});

		this.eventEmitter.on(TransportOp.CamsPlayerJoin, (data) => {
			this.log(
				LogMode.Info,
				"%s started looking at cameras.",
				this.fmtPlayer(data.clientId)
			);
			this.emitPlayerFlags(data.clientId, PlayerFlag.OnCams, true);
		});

		this.eventEmitter.on(TransportOp.CamsPlayerLeave, (data) => {
			this.log(
				LogMode.Info,
				"%s stopped looking at cameras.",
				this.fmtPlayer(data.clientId)
			);
			this.emitPlayerFlags(data.clientId, PlayerFlag.OnCams, false);
		});

		this.eventEmitter.on(TransportOp.CommsSabotage, () => {
			this.log(LogMode.Info, "Someone sabotaged communications.");
			this.emitGameFlags(GameFlag.CommsSabotaged, true);
		});

		this.eventEmitter.on(TransportOp.CommsRepair, () => {
			this.log(LogMode.Info, "Someone repaired communications.");
			this.emitGameFlags(GameFlag.CommsSabotaged, false);
		});

		this.eventEmitter.on(TransportOp.PlayerVentEnter, (data) => {
			this.log(
				LogMode.Log,
				"%s entered vent %s.",
				this.fmtPlayer(data.clientId),
				this.getVentName(data.ventId)
			);
			this.emitPlayerVent(data.clientId, data.ventId);
		});

		this.eventEmitter.on(TransportOp.PlayerVentExit, (data) => {
			const player = this.getOrCreatePlayer(data.clientId);
			this.log(LogMode.Log, "%s exited a vent.", player);
			this.emitPlayerVent(data.clientId, -1);
		});
	}

	destroy(): void {
		this.socket?.close();
	}
}

export enum IdentifyError {
	GameNotFound = "GAME_NOT_FOUND",
	AlreadyTracked = "ALREADY_TRACKED",
}

export enum TransportOp {
	Hello = "HELLO",
	Error = "ERROR",
	Destroy = "DESTROY",
	HostUpdate = "HOST_UPDATE",
	PlayerMove = "PLAYER_MOVE",
	PlayerUpdate = "PLAYER_UPDATE",
	SettingsUpdate = "SETTINGS_UPDATE",
	GameStart = "GAME_START",
	GameEnd = "GAME_END",
	MeetingStart = "MEETING_START",
	MeetingEnd = "MEETING_END",
	PlayerKill = "PLAYER_KILL",
	ImpostorsUpdate = "IMPOSTORS_UPDATE",
	CamsPlayerJoin = "CAMS_PLAYER_JOIN",
	CamsPlayerLeave = "CAMS_PLAYER_LEAVE",
	CommsSabotage = "COMMS_SABOTAGE",
	CommsRepair = "COMMS_REPAIR",
	PlayerVentEnter = "PlAYER_VENT_ENTER",
	PlayerVentExit = "PLAYER_VENT_EXIT",
}
