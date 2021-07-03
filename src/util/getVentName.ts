import * as skeldjs from "@skeldjs/core";

export function getVentName(
	map: skeldjs.GameMap,
	ventid: number
): string | null {
	const data = skeldjs.MapVentData[map][ventid];

	if (!data) return null;

	switch (map) {
		case skeldjs.GameMap.TheSkeld:
			return skeldjs.TheSkeldVent[data.id];
		case skeldjs.GameMap.MiraHQ:
			return skeldjs.MiraHQVent[data.id];
		case skeldjs.GameMap.Polus:
			return skeldjs.PolusVent[data.id];
		case skeldjs.GameMap.Airship:
			return skeldjs.AirshipVent[data.id];
	}

	return null;
}
