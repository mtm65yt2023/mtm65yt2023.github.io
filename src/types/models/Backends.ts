import { PublicLobbyRegion } from "./PublicLobbyRegion";

export enum BackendType {
	NoOp,
	PublicLobby,
	Impostor,
	CustomServer,
}

export interface BackendModel {
	gameCode: string;
	backendType: BackendType;
}

export interface PublicLobbyBackendModel extends BackendModel {
	backendType: BackendType.PublicLobby;
	region: PublicLobbyRegion;
}

export interface CustomServerBackendModel extends BackendModel {
	backendType: BackendType.Impostor;
	ip: string;
}
