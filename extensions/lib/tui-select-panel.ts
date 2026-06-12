import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, SelectList, Text, type SelectItem } from "@earendil-works/pi-tui";

export interface SelectPanelOptions {
	theme: Theme;
	title: string;
	subtitle?: string;
	help: string;
	items: SelectItem[];
	maxHeight: number;
}

export interface SelectPanelResult {
	container: Container;
	selectList: SelectList;
}

export function createSelectListTheme(theme: Theme) {
	return {
		selectedPrefix: (text: string) => theme.fg("accent", text),
		selectedText: (text: string) => theme.fg("accent", text),
		description: (text: string) => theme.fg("muted", text),
		scrollInfo: (text: string) => theme.fg("dim", text),
		noMatch: (text: string) => theme.fg("warning", text),
	};
}

export function createSelectPanel(options: SelectPanelOptions): SelectPanelResult {
	const { theme, title, subtitle, help, items, maxHeight } = options;
	const container = new Container();
	container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));
	container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
	if (subtitle) container.addChild(new Text(theme.fg("muted", subtitle), 1, 0));

	const selectList = new SelectList(items, Math.min(items.length, maxHeight), createSelectListTheme(theme));
	container.addChild(selectList);
	container.addChild(new Text(theme.fg("dim", help), 1, 0));
	container.addChild(new DynamicBorder((text: string) => theme.fg("accent", text)));

	return { container, selectList };
}
