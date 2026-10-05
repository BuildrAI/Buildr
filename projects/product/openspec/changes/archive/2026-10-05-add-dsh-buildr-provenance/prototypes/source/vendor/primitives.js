import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import clsx from "clsx";
import css from "./StateDot.module.css";
import { Fragment as Fragment$1, cloneElement, createContext, createElement, forwardRef, memo, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import css$1 from "./TextShimmer.module.css";
import css$2 from "./DisclosureRow.module.css";
import css$3 from "./Button.module.css";
import css$4 from "./Pill.module.css";
import css$5 from "./SegmentedTabs.module.css";
import css$6 from "./Tag.module.css";
import { pathPartsOf } from "@deepseek-ai/dsh-util-workspace-path";
import css$7 from "./PathLabel.module.css";
import css$8 from "./Switch.module.css";
import css$9 from "./SegmentedControl.module.css";
import css$10 from "./Checkbox.module.css";
import css$11 from "./Input.module.css";
import { createPortal } from "react-dom";
import css$12 from "./ShortcutKeys.module.css";
import css$13 from "./MenuSurface.module.css";
import css$14 from "./Menu.module.css";
import css$15 from "./MenuGroup.module.css";
import css$16 from "./Tooltip.module.css";
import css$17 from "./HoverCard.module.css";
import css$18 from "./Modal.module.css";
import css$19 from "./RiskConfirmation.module.css";
import css$20 from "./ConnectionIndicator.module.css";
import css$21 from "./FileTypeIcon.module.css";
import { siAliexpress, siApple, siBaidu, siBilibili, siCsdn, siDuckduckgo, siEbay, siFacebook, siGithub, siGitlab, siGoogle, siInstagram, siJuejin, siMdnwebdocs, siNetflix, siNpm, siPypi, siQq, siQuora, siReddit, siSinaweibo, siSpotify, siStackoverflow, siTaobao, siTelegram, siTiktok, siV2ex, siWechat, siWhatsapp, siWikipedia, siX, siYcombinator, siYoutube, siZhihu } from "simple-icons";
import css$22 from "./user-text.module.css";
import markdownCss from "./markdown/MarkdownText.module.css";
import css$23 from "./Toast.module.css";
import css$24 from "./settings-form/SettingsForm.module.css";
import css$25 from "./settings-form/fields.module.css";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-store";
import { createCssVariablesTheme, createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine, defaultJavaScriptRegexConstructor } from "shiki/engine/javascript";
import langTs from "@shikijs/langs/typescript";
import langBash from "@shikijs/langs/shellscript";
import langJson from "@shikijs/langs/json";
import { CODE_HIGHLIGHT_EXTENSIONS, languageForPath } from "@deepseek-ai/dsh-util-code-language";
import css$26 from "./JsonTree.module.css";
import Anser from "anser";
import css$27 from "./TerminalBlock.module.css";
import cardCss from "./CodeCard.module.css";
import css$28 from "./ReadBlock.module.css";
import { structuredPatch } from "diff";
import css$29 from "./DiffBlock.module.css";
import css$30 from "./SearchBlock.module.css";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { mathFromMarkdown } from "mdast-util-math";
import { gfm } from "micromark-extension-gfm";
import { math } from "micromark-extension-math";
import { attention } from "micromark-core-commonmark";
import { markdownLineEnding, unicodePunctuation } from "micromark-util-character";
import { classifyCharacter } from "micromark-util-classify-character";
import { codes, constants, types } from "micromark-util-symbol";
import { factorySpace } from "micromark-factory-space";
import { normalizeUri } from "micromark-util-sanitize-uri";
import css$31 from "./markdown/CodeBlock.module.css";
import katex from "katex";
import css$32 from "./ImageLightbox.module.css";
import css$33 from "./ImagePreview.module.css";
// Offline fixtures contain no math. KaTeX font CSS excluded to respect single-file size; default prose/code renderer retained.
import css$34 from "./WebBlock.module.css";
import css$35 from "./markdown/JsonBlock.module.css";
//#region lib/types/icons/shared-artwork.js
/**
* Render new-conversation geometry — the bubble around a plus — for product icons.
* @param props - Size, optional CSS class, and inherited stroke width.
* @returns The decorative SVG artwork.
*/
const NewChatOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M2.37091 11.2501C1.58745 9.89288 1.32067 8.29835 1.61969 6.76006C1.91872 5.22177 2.76342 3.8433 3.99826 2.87846C5.2331 1.91362 6.77494 1.42737 8.33988 1.50925C9.90482 1.59113 11.3875 2.23562 12.5149 3.32406C13.6425 4.41269 14.3387 5.87206 14.4754 7.4334C14.612 8.99474 14.18 10.5529 13.2587 11.8209C12.3375 13.0888 10.9891 13.9813 9.46194 14.3337C8.18691 14.628 6.85895 14.5294 5.64989 14.0605C5.1712 13.8748 4.76962 13.4932 4.26534 13.3967C3.67413 13.2835 2.95257 13.5598 2.03794 14.3337",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8 5V11",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M5 8H11",
			stroke: "currentColor"
		})
	]
});
/**
* Render shared conversation geometry — the chat bubble around two text
* lines — for the queue product icon and session reference icons.
* @param props - Size, optional CSS class, and inherited stroke width.
* @returns The decorative SVG artwork.
*/
const ChatLinesOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M5 6.75H11",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M5 9H8",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2.37067 11.2497C1.5872 9.89252 1.32042 8.29798 1.61945 6.7597C1.91847 5.22141 2.76317 3.84293 3.99801 2.87809C5.23285 1.91325 6.7747 1.427 8.33964 1.50888C9.90458 1.59076 11.3873 2.23526 12.5147 3.32369C13.6422 4.41232 14.3384 5.8717 14.4751 7.43304C14.6118 8.99438 14.1797 10.5525 13.2585 11.8205C12.3372 13.0885 10.9889 13.9809 9.4617 14.3334C8.18666 14.6277 6.8587 14.529 5.64964 14.0601C5.17095 13.8745 4.76937 13.4929 4.26509 13.3963C3.67389 13.2832 2.95232 13.5595 2.0377 14.3334",
			stroke: "currentColor"
		})
	]
});
/**
* Render shared globe geometry for product and link icons.
* @param props - Size, optional CSS class, and inherited stroke width.
* @returns The decorative SVG artwork.
*/
const GlobeOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M7.99986 14.0887C11.3626 14.0887 14.0886 11.3627 14.0886 7.99998C14.0886 4.63727 11.3626 1.91125 7.99986 1.91125C4.63715 1.91125 1.91113 4.63727 1.91113 7.99998C1.91113 11.3627 4.63715 14.0887 7.99986 14.0887Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2.34619 8H13.6538",
			stroke: "currentColor",
			strokeLinecap: "square"
		}),
		jsx("path", {
			d: "M7.99976 14.0889C9.23509 14.0889 10.1743 11.3629 10.1743 8.00006C10.1743 4.63739 9.23509 1.91138 7.99976 1.91138",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M7.99973 14.0889C6.76445 14.0889 5.8252 11.3629 5.8252 8.00006C5.8252 4.63739 6.76445 1.91138 7.99973 1.91138",
			stroke: "currentColor"
		})
	]
});
/**
* Render shared code-bracket geometry for product and link icons.
* @param props - Size, optional CSS class, and inherited stroke width.
* @returns The decorative SVG artwork.
*/
const CodeBracketsArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M4.67398 4.25061L1.36094 7.86484C1.29085 7.9413 1.29085 8.05866 1.36094 8.13513L4.67398 11.7494",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M11.3262 4.25061L14.6392 7.86484C14.7093 7.9413 14.7093 8.05866 14.6392 8.13513L11.3262 11.7494",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M9.56222 3.62573L6.43774 12.3743",
			stroke: "currentColor"
		})
	]
});
/**
* Render shared document-browse geometry for product and reference icons.
* @param props - Size, optional CSS class, and inherited stroke width.
* @returns The decorative SVG artwork.
*/
const BrowseOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M4.9375 5.90295H11.0625",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M4.9375 9.02991H8.27841",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V13.2246C13.9996 14.0489 13.3036 14.6738 12.5 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5ZM3.5 2.32617C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H12.5C12.8004 13.6738 12.9996 13.4489 13 13.2246V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5Z",
			fill: "currentColor"
		})
	]
});
/**
* Render shared closed-folder geometry for product, reference, and link icons.
* @param props - Size, optional CSS class, and inherited stroke width.
* @returns The decorative SVG artwork.
*/
const FolderCloseArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M1.50439 3.11059C1.50439 2.55831 1.95211 2.1106 2.50439 2.1106H5.43389C5.67773 2.1106 5.91318 2.19969 6.09593 2.36113L7.71649 3.79265C7.89924 3.95409 8.1347 4.04319 8.3785 4.04319H13.4958C14.0481 4.04319 14.4958 4.4909 14.4958 5.04319V12.8894C14.4958 13.4417 14.0481 13.8894 13.4958 13.8894H2.50439C1.95211 13.8894 1.50439 13.4417 1.50439 12.8894V4.04319V3.11059Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M3.63501 7.66614H12.3647",
		stroke: "currentColor"
	})]
});
//#endregion
//#region lib/types/icons/index.js
/**
* Shared current-color product icons. Names identify the glyph and weight;
* rendered size remains a prop instead of part of the component name.
*/
/** Shared shield contour used by composite icons outside this module. */
const SHIELD_OUTLINE_PATH = "M6.80132 2.14853C7.70663 1.80917 8.70422 1.80919 9.60952 2.14859L14.1296 3.84317V7.11961C14.1296 11.6089 10.7615 13.5975 8.20543 14.5779C5.64931 13.5975 2.28052 11.6089 2.28052 7.11961V3.84317L6.80132 2.14853Z";
/** Regular stroke width used by the product icon set. */
const ICON_REGULAR_STROKE = 1;
/** Medium stroke width used by emphasized product icons. */
const ICON_MEDIUM_STROKE = 1.3;
/** Regular one-pixel IconNewChatOutline artwork. */
const IconNewChatOutlineRegular = (props) => jsx(NewChatOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconNewChatOutline artwork with a 1.3px stroke. */
const IconNewChatOutlineMedium = (props) => jsx(NewChatOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconSearchOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M10.2991 10.3933L14.7783 14.8725",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconSearchOutline artwork. */
const IconSearchOutlineRegular = (props) => jsx(IconSearchOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconSearchOutline artwork with a 1.3px stroke. */
const IconSearchOutlineMedium = (props) => jsx(IconSearchOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
/** Regular one-pixel IconGlobeOutline artwork. */
const IconGlobeOutlineRegular = (props) => jsx(GlobeOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconGlobeOutline artwork with a 1.3px stroke. */
const IconGlobeOutlineMedium = (props) => jsx(GlobeOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconSettingsOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M8 9.75012C8.9665 9.75012 9.75 8.96662 9.75 8.00012C9.75 7.03362 8.9665 6.25012 8 6.25012C7.0335 6.25012 6.25 7.03362 6.25 8.00012C6.25 8.96662 7.0335 9.75012 8 9.75012Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M13.0107 7.79377C12.9505 7.89401 12.9205 7.94413 12.9205 7.99951C12.9205 8.0549 12.9505 8.10502 13.0106 8.20528L13.9849 9.83006C14.045 9.93029 14.0751 9.9804 14.0751 10.0358C14.0751 10.0911 14.045 10.1413 13.9849 10.2415L13.0037 11.8777C12.9468 11.9726 12.9184 12.0201 12.8725 12.0461C12.8267 12.072 12.7713 12.072 12.6607 12.072H10.6704C10.5598 12.072 10.5045 12.072 10.4586 12.098C10.4128 12.1239 10.3843 12.1714 10.3274 12.2662L9.33825 13.9142C9.28133 14.009 9.25287 14.0564 9.20703 14.0823C9.16118 14.1083 9.10588 14.1083 8.99529 14.1083H7.00486C6.89426 14.1083 6.83896 14.1083 6.79312 14.0823C6.74727 14.0564 6.71881 14.009 6.6619 13.9142L5.67273 12.2662C5.61581 12.1714 5.58735 12.1239 5.54151 12.098C5.49566 12.072 5.44036 12.072 5.32977 12.072H3.33945C3.2288 12.072 3.17347 12.072 3.12761 12.0461C3.08176 12.0201 3.0533 11.9726 2.9964 11.8777L2.0152 10.2415C1.9551 10.1413 1.92505 10.0911 1.92505 10.0358C1.92505 9.9804 1.9551 9.93029 2.0152 9.83006L2.98951 8.20528C3.04963 8.10502 3.07969 8.0549 3.07969 7.99951C3.07968 7.94413 3.04961 7.89401 2.98946 7.79377L2.01529 6.17011C1.95514 6.06987 1.92507 6.01975 1.92507 5.96437C1.92506 5.90899 1.95512 5.85886 2.01524 5.7586L2.9964 4.1224C3.0533 4.0275 3.08176 3.98005 3.12761 3.95408C3.17347 3.92811 3.2288 3.92811 3.33945 3.92811H5.32977C5.44036 3.92811 5.49566 3.92811 5.54151 3.90216C5.58735 3.87621 5.61581 3.82879 5.67273 3.73397L6.6619 2.08599C6.71881 1.99116 6.74727 1.94375 6.79312 1.9178C6.83896 1.89185 6.89426 1.89185 7.00486 1.89185H8.99529C9.10588 1.89185 9.16118 1.89185 9.20703 1.9178C9.25287 1.94375 9.28133 1.99116 9.33825 2.08599L10.3274 3.73397C10.3843 3.82879 10.4128 3.87621 10.4586 3.90216C10.5045 3.92811 10.5598 3.92811 10.6704 3.92811H12.6607C12.7713 3.92811 12.8267 3.92811 12.8725 3.95408C12.9184 3.98005 12.9468 4.0275 13.0037 4.1224L13.9849 5.7586C14.045 5.85886 14.0751 5.90899 14.0751 5.96437C14.0751 6.01975 14.045 6.06987 13.9849 6.17011L13.0107 7.79377Z",
		stroke: "currentColor",
		strokeMiterlimit: "10"
	})]
});
/** Regular one-pixel IconSettingsOutline artwork. */
const IconSettingsOutlineRegular = (props) => jsx(IconSettingsOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconSettingsOutline artwork with a 1.3px stroke. */
const IconSettingsOutlineMedium = (props) => jsx(IconSettingsOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPanelLeftOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M5.5 1.5V14.5",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconPanelLeftOutline artwork. */
const IconPanelLeftOutlineRegular = (props) => jsx(IconPanelLeftOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPanelLeftOutline artwork with a 1.3px stroke. */
const IconPanelLeftOutlineMedium = (props) => jsx(IconPanelLeftOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconEllipsisOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M3 9C3.55228 9 4 8.55228 4 8C4 7.44772 3.55228 7 3 7C2.44772 7 2 7.44772 2 8C2 8.55228 2.44772 9 3 9Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M8 9C8.55228 9 9 8.55228 9 8C9 7.44772 8.55228 7 8 7C7.44772 7 7 7.44772 7 8C7 8.55228 7.44772 9 8 9Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M13 9C13.5523 9 14 8.55228 14 8C14 7.44772 13.5523 7 13 7C12.4477 7 12 7.44772 12 8C12 8.55228 12.4477 9 13 9Z",
			fill: "currentColor"
		})
	]
});
/** Regular IconEllipsisOutline artwork; its fill-only geometry is weight-independent. */
const IconEllipsisOutlineRegular = (props) => jsx(IconEllipsisOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconEllipsisOutline artwork; it matches Regular because the geometry is fill-only. */
const IconEllipsisOutlineMedium = (props) => jsx(IconEllipsisOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPlusOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M8 2V14",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M2 8H14",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconPlusOutline artwork. */
const IconPlusOutlineRegular = (props) => jsx(IconPlusOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPlusOutline artwork with a 1.3px stroke. */
const IconPlusOutlineMedium = (props) => jsx(IconPlusOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCheckOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconCheckOutline artwork. */
const IconCheckOutlineRegular = (props) => jsx(IconCheckOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCheckOutline artwork with a 1.3px stroke. */
const IconCheckOutlineMedium = (props) => jsx(IconCheckOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconBranchOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M1.01503 8.0001L5.6964 8.0001C6.41913 8.0001 6.78049 8.0001 7.12115 7.91951C7.4232 7.84804 7.71233 7.73014 7.97821 7.57C8.27809 7.38939 8.5364 7.13669 9.05303 6.63129L11.3281 4.40564",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M1.01221 7.9999L5.6964 7.9999C6.41913 7.9999 6.78049 7.9999 7.12115 8.08049C7.4232 8.15196 7.71233 8.26986 7.97821 8.43C8.27809 8.61061 8.5364 8.86331 9.05303 9.36871L11.3281 11.5944",
			stroke: "currentColor"
		}),
		jsx("circle", {
			cx: "12.4502",
			cy: "3.3079",
			r: "1.56962",
			stroke: "currentColor"
		}),
		jsx("circle", {
			cx: "12.4502",
			cy: "12.6921",
			r: "1.56962",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconBranchOutline artwork. */
const IconBranchOutlineRegular = (props) => jsx(IconBranchOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconBranchOutline artwork with a 1.3px stroke. */
const IconBranchOutlineMedium = (props) => jsx(IconBranchOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconChevronDownOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconChevronDownOutline artwork. */
const IconChevronDownOutlineRegular = (props) => jsx(IconChevronDownOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconChevronDownOutline artwork with a 1.3px stroke. */
const IconChevronDownOutlineMedium = (props) => jsx(IconChevronDownOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconChevronLeftOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M10 4L6.70711 7.29289C6.31658 7.68342 6.31658 8.31658 6.70711 8.70711L10 12",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconChevronLeftOutline artwork. */
const IconChevronLeftOutlineRegular = (props) => jsx(IconChevronLeftOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconChevronLeftOutline artwork with a 1.3px stroke. */
const IconChevronLeftOutlineMedium = (props) => jsx(IconChevronLeftOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconChevronRightOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconChevronRightOutline artwork. */
const IconChevronRightOutlineRegular = (props) => jsx(IconChevronRightOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconChevronRightOutline artwork with a 1.3px stroke. */
const IconChevronRightOutlineMedium = (props) => jsx(IconChevronRightOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconTriangleRightFillArtwork = ({ size = 14, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M5.5 4.5C5.5 4.40714 5.52586 4.31612 5.57467 4.23713C5.62349 4.15815 5.69334 4.09431 5.77639 4.05279C5.85945 4.01126 5.95242 3.99368 6.0449 4.00202C6.13738 4.01036 6.22572 4.04429 6.3 4.1L10.967 7.6C11.0291 7.64657 11.0795 7.70697 11.1142 7.77639C11.1489 7.84582 11.167 7.92238 11.167 8C11.167 8.07762 11.1489 8.15418 11.1142 8.22361C11.0795 8.29303 11.0291 8.35343 10.967 8.4L6.3 11.9C6.22572 11.9557 6.13738 11.9896 6.0449 11.998C5.95242 12.0063 5.85945 11.9887 5.77639 11.9472C5.69334 11.9057 5.62349 11.8419 5.57467 11.7629C5.52586 11.6839 5.5 11.5929 5.5 11.5V4.5Z",
		fill: "currentColor"
	})
});
/** Regular IconTriangleRightFill artwork; its fill-only geometry is weight-independent. */
const IconTriangleRightFillRegular = (props) => jsx(IconTriangleRightFillArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconTriangleRightFill artwork; it matches Regular because the geometry is fill-only. */
const IconTriangleRightFillMedium = (props) => jsx(IconTriangleRightFillArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconChevronUpOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconChevronUpOutline artwork. */
const IconChevronUpOutlineRegular = (props) => jsx(IconChevronUpOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconChevronUpOutline artwork with a 1.3px stroke. */
const IconChevronUpOutlineMedium = (props) => jsx(IconChevronUpOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCloseOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M2.5 2.5L13.5 13.5",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M13.5 2.5L2.5 13.5",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconCloseOutline artwork. */
const IconCloseOutlineRegular = (props) => jsx(IconCloseOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCloseOutline artwork with a 1.3px stroke. */
const IconCloseOutlineMedium = (props) => jsx(IconCloseOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCloseFillArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M3.5 3.5L12.5 12.5",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M12.5 3.5L3.5 12.5",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconCloseFill artwork. */
const IconCloseFillRegular = (props) => jsx(IconCloseFillArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCloseFill artwork with a 1.3px stroke. */
const IconCloseFillMedium = (props) => jsx(IconCloseFillArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCloseCircleFillArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		fillRule: "evenodd",
		clipRule: "evenodd",
		d: "M15 8A7 7 0 1 1 1 8A7 7 0 1 1 15 8ZM6.409 10.652L5.348 9.591L6.939 8L5.348 6.409L6.409 5.348L8 6.939L9.591 5.348L10.652 6.409L9.061 8L10.652 9.591L9.591 10.652L8 9.061Z",
		fill: "currentColor"
	})
});
/** Regular IconCloseCircleFill artwork (cross knocked out of a filled disc); its fill-only geometry is weight-independent. */
const IconCloseCircleFillRegular = (props) => jsx(IconCloseCircleFillArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCloseCircleFill artwork; it matches Regular because the geometry is fill-only. */
const IconCloseCircleFillMedium = (props) => jsx(IconCloseCircleFillArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCopyOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("rect", {
		x: "1.52075",
		y: "4.07373",
		width: "10.3932",
		height: "10.3932",
		rx: "2",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z",
		fill: "currentColor"
	})]
});
/** Regular one-pixel IconCopyOutline artwork. */
const IconCopyOutlineRegular = (props) => jsx(IconCopyOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCopyOutline artwork with a 1.3px stroke. */
const IconCopyOutlineMedium = (props) => jsx(IconCopyOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconRefreshOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5C9.9001 1.5 11.7001 2.3 13.0001 3.6L14.5001 5.1",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M14.4999 1.5V5.1H10.8999",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconRefreshOutline artwork. */
const IconRefreshOutlineRegular = (props) => jsx(IconRefreshOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconRefreshOutline artwork with a 1.3px stroke. */
const IconRefreshOutlineMedium = (props) => jsx(IconRefreshOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconLikeOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M13.537 8.12098L12.3983 12.8455C12.1818 13.7438 11.378 14.3769 10.454 14.3769L9.35595 14.3769H7.43799H5.16577C3.50892 14.3769 2.16577 13.0337 2.16577 11.3769V7.88668C2.16577 7.33439 2.61349 6.88668 3.16577 6.88668H4.02665C5.84943 6.88668 7.38083 3.28711 7.67689 2.54578C7.71259 2.45639 7.73501 2.36373 7.77922 2.27824C7.86506 2.11221 8.08228 1.87578 8.59039 2.07775C10.3291 2.76886 9.23144 6.04071 8.96955 6.75058C8.94502 6.81707 8.99495 6.88668 9.06581 6.88668H12.5648C13.2119 6.88668 13.6886 7.49192 13.537 8.12098Z",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconLikeOutline artwork. */
const IconLikeOutlineRegular = (props) => jsx(IconLikeOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconLikeOutline artwork with a 1.3px stroke. */
const IconLikeOutlineMedium = (props) => jsx(IconLikeOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconLikeFillArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M13.537 8.12098L12.3983 12.8455C12.1818 13.7438 11.378 14.3769 10.454 14.3769L9.35595 14.3769H7.43799H5.16577C3.50892 14.3769 2.16577 13.0337 2.16577 11.3769V7.88668C2.16577 7.33439 2.61349 6.88668 3.16577 6.88668H4.02665C5.84943 6.88668 7.38083 3.28711 7.67689 2.54578C7.71259 2.45639 7.73501 2.36373 7.77922 2.27824C7.86506 2.11221 8.08228 1.87578 8.59039 2.07775C10.3291 2.76886 9.23144 6.04071 8.96955 6.75058C8.94502 6.81707 8.99495 6.88668 9.06581 6.88668H12.5648C13.2119 6.88668 13.6886 7.49192 13.537 8.12098Z",
		fill: "currentColor",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconLikeFill artwork. */
const IconLikeFillRegular = (props) => jsx(IconLikeFillArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconLikeFill artwork with a 1.3px stroke. */
const IconLikeFillMedium = (props) => jsx(IconLikeFillArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconDislikeOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M2.46302 8.06749L3.60171 3.34299C3.81822 2.44467 4.62196 1.81162 5.546 1.8116L6.64406 1.81158L8.56202 1.81158L10.8342 1.81158C12.4911 1.81158 13.8342 3.15473 13.8342 4.81158L13.8342 8.3018C13.8342 8.85408 13.3865 9.3018 12.8342 9.3018L11.9734 9.3018C10.1506 9.3018 8.61918 12.9014 8.32311 13.6427C8.28741 13.7321 8.26499 13.8247 8.22078 13.9102C8.13494 14.0763 7.91772 14.3127 7.40961 14.1107C5.67089 13.4196 6.76856 10.1478 7.03045 9.43789C7.05498 9.37141 7.00505 9.3018 6.93419 9.3018L3.43519 9.3018C2.78811 9.3018 2.31141 8.69656 2.46302 8.06749Z",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconDislikeOutline artwork. */
const IconDislikeOutlineRegular = (props) => jsx(IconDislikeOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconDislikeOutline artwork with a 1.3px stroke. */
const IconDislikeOutlineMedium = (props) => jsx(IconDislikeOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconDislikeFillArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M2.46302 8.06749L3.60171 3.34299C3.81822 2.44467 4.62196 1.81162 5.546 1.8116L6.64406 1.81158L8.56202 1.81158L10.8342 1.81158C12.4911 1.81158 13.8342 3.15473 13.8342 4.81158L13.8342 8.3018C13.8342 8.85408 13.3865 9.3018 12.8342 9.3018L11.9734 9.3018C10.1506 9.3018 8.61918 12.9014 8.32311 13.6427C8.28741 13.7321 8.26499 13.8247 8.22078 13.9102C8.13494 14.0763 7.91772 14.3127 7.40961 14.1107C5.67089 13.4196 6.76856 10.1478 7.03045 9.43789C7.05498 9.37141 7.00505 9.3018 6.93419 9.3018L3.43519 9.3018C2.78811 9.3018 2.31141 8.69656 2.46302 8.06749Z",
		fill: "currentColor",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconDislikeFill artwork. */
const IconDislikeFillRegular = (props) => jsx(IconDislikeFillArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconDislikeFill artwork with a 1.3px stroke. */
const IconDislikeFillMedium = (props) => jsx(IconDislikeFillArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconShareOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M14.1256 7.58723C14.3483 7.81942 14.3482 8.18589 14.1254 8.41799L8.6646 14.1077C8.53985 14.2377 8.32031 14.1494 8.32031 13.9692L8.32035 10.2039C8.32035 10.1943 8.31534 10.1864 8.30592 10.1849C8.08306 10.148 5.30067 9.7729 1.50993 13.2904C1.49711 13.3023 1.47561 13.2943 1.4757 13.2768C1.49273 9.87168 3.42001 5.07166 8.29999 5.05835C8.31103 5.05832 8.32035 5.04937 8.32035 5.03832L8.32031 2.03109C8.32031 1.85088 8.53993 1.76259 8.66466 1.89266L14.1256 7.58723Z",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconShareOutline artwork. */
const IconShareOutlineRegular = (props) => jsx(IconShareOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconShareOutline artwork with a 1.3px stroke. */
const IconShareOutlineMedium = (props) => jsx(IconShareOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconDeliverDocArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M6.15479 4.91687H9.84543",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M11.8798 9.55347V2.71525C11.8798 2.37416 11.564 2.09766 11.1744 2.09766H4.82577C4.43618 2.09766 4.12036 2.37416 4.12036 2.71525V9.55347",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2.28735 13.8022V8.84792C2.28735 8.77514 2.36262 8.72673 2.42884 8.75693L13.2936 13.7112C13.3914 13.7558 13.3596 13.9022 13.2521 13.9022H2.38735C2.33213 13.9022 2.28735 13.8575 2.28735 13.8022Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M7.46929 10.979L13.5783 8.7416C13.6435 8.7177 13.7126 8.76601 13.7126 8.83551L13.7125 13.8022C13.7125 13.8574 13.6678 13.9022 13.6125 13.9022H7.99999",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M6.15479 7.2395H9.05644",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconDeliverDoc artwork. */
const IconDeliverDocRegular = (props) => jsx(IconDeliverDocArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconDeliverDoc artwork with a 1.3px stroke. */
const IconDeliverDocMedium = (props) => jsx(IconDeliverDocArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconEditOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z",
		fill: "currentColor"
	}), jsx("path", {
		d: "M7.7849 8.23878L13.888 2.13574",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconEditOutline artwork. */
const IconEditOutlineRegular = (props) => jsx(IconEditOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconEditOutline artwork with a 1.3px stroke. */
const IconEditOutlineMedium = (props) => jsx(IconEditOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconThinkOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M10.2854 5.71481C12.9673 8.39663 14.1182 11.5938 12.8562 12.8559C11.5942 14.1179 8.39706 12.9669 5.71518 10.2851C3.03333 7.60323 1.88236 4.40608 3.14441 3.14403C4.40644 1.882 7.6036 3.03297 10.2854 5.71481Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M10.2854 10.2851C7.6036 12.9669 4.40644 14.1179 3.14441 12.8559C1.88236 11.5938 3.03333 8.39663 5.71518 5.71481C8.39706 3.03297 11.5942 1.882 12.8562 3.14403C14.1182 4.40608 12.9673 7.60323 10.2854 10.2851Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8.86291 8.0002C8.86291 8.47549 8.47762 8.86087 8.00224 8.86087C7.52694 8.86087 7.1416 8.47549 7.1416 8.0002C7.1416 7.52485 7.52694 7.13953 8.00224 7.13953C8.47762 7.13953 8.86291 7.52485 8.86291 8.0002Z",
			fill: "currentColor"
		})
	]
});
/** Regular one-pixel IconThinkOutline artwork. */
const IconThinkOutlineRegular = (props) => jsx(IconThinkOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconThinkOutline artwork with a 1.3px stroke. */
const IconThinkOutlineMedium = (props) => jsx(IconThinkOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconAgentPresetOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M6.51867 12.3282C7.29816 12.6011 8.16475 12.6514 9.02269 12.4216C9.57879 12.2726 10.0784 12.0185 10.5087 11.6888C10.7819 12.0555 11.1606 12.3304 11.5913 12.4805C10.9688 13.029 10.2149 13.4478 9.35911 13.6771C8.13946 14.0038 6.90632 13.8971 5.82126 13.4533C6.15821 13.1562 6.4021 12.7652 6.51867 12.3282ZM9.17629 2.89409C11.1101 3.34433 12.739 4.81872 13.2889 6.87043C13.4219 7.3665 13.4811 7.8649 13.4774 8.35466C13.0924 8.13213 12.6422 8.01837 12.1741 8.05276L12.1711 8.05257C12.1539 7.77199 12.109 7.48889 12.0334 7.20684C11.6363 5.72533 10.5048 4.6372 9.13549 4.22844C9.25559 3.87667 9.29214 3.49087 9.22309 3.09892C9.2108 3.02922 9.19451 2.96108 9.17629 2.89409ZM4.7311 3.89107L4.78302 4.11879C4.87648 4.4488 5.04146 4.74263 5.25579 4.98896C3.98078 6.01355 3.35848 7.72904 3.8089 9.41059C3.81828 9.44559 3.82866 9.48025 3.83885 9.51479C3.38217 9.61268 2.98548 9.84137 2.68107 10.1556C2.63414 10.022 2.5897 9.88632 2.55244 9.74726C1.93301 7.43489 2.86717 5.07173 4.71504 3.76697L4.7311 3.89107Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M7.99136 5.28105C8.87501 5.28105 9.59136 4.56471 9.59136 3.68105C9.59136 2.7974 8.87501 2.08105 7.99136 2.08105C7.1077 2.08105 6.39136 2.7974 6.39136 3.68105C6.39136 4.56471 7.1077 5.28105 7.99136 5.28105Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M3.94009 12.9417C4.82374 12.9417 5.54009 12.2254 5.54009 11.3417C5.54009 10.458 4.82374 9.7417 3.94009 9.7417C3.05643 9.7417 2.34009 10.458 2.34009 11.3417C2.34009 12.2254 3.05643 12.9417 3.94009 12.9417Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.0851 12.9417C12.9688 12.9417 13.6851 12.2254 13.6851 11.3417C13.6851 10.458 12.9688 9.7417 12.0851 9.7417C11.2015 9.7417 10.4851 10.458 10.4851 11.3417C10.4851 12.2254 11.2015 12.9417 12.0851 12.9417Z",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconAgentPresetOutline artwork. */
const IconAgentPresetOutlineRegular = (props) => jsx(IconAgentPresetOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconAgentPresetOutline artwork with a 1.3px stroke. */
const IconAgentPresetOutlineMedium = (props) => jsx(IconAgentPresetOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
/** Regular one-pixel IconBrowseOutline artwork. */
const IconBrowseOutlineRegular = (props) => jsx(BrowseOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconBrowseOutline artwork with a 1.3px stroke. */
const IconBrowseOutlineMedium = (props) => jsx(BrowseOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconContextInjectionOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M5 2.5H3.5C3.23478 2.5 2.98043 2.60536 2.79289 2.79289C2.60536 2.98043 2.5 3.23478 2.5 3.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V3.5C13.5 3.23478 13.3946 2.98043 13.2071 2.79289C13.0196 2.60536 12.7652 2.5 12.5 2.5H11",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8 0.5V7.5",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M5.5 5L8 7.5L10.5 5",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M5.5 11H10.5",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconContextInjectionOutline artwork. */
const IconContextInjectionOutlineRegular = (props) => jsx(IconContextInjectionOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconContextInjectionOutline artwork with a 1.3px stroke. */
const IconContextInjectionOutlineMedium = (props) => jsx(IconContextInjectionOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconLinkOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M6.59961 9.40051C6.82779 9.6334 7.10015 9.81842 7.40074 9.94472C7.70132 10.071 8.02409 10.1361 8.35013 10.1361C8.67618 10.1361 8.99894 10.071 9.29953 9.94472C9.60011 9.81842 9.87247 9.6334 10.1007 9.40051L12.9015 6.59967C13.3658 6.13541 13.6266 5.50572 13.6266 4.84915C13.6266 4.19258 13.3658 3.56289 12.9015 3.09863C12.4372 2.63436 11.8075 2.37354 11.151 2.37354C10.4944 2.37354 9.86472 2.63436 9.40045 3.09863L9.05034 3.44873",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M9.40051 6.59959C9.17233 6.3667 8.89997 6.18169 8.59939 6.05538C8.2988 5.92907 7.97603 5.86401 7.64999 5.86401C7.32395 5.86401 7.00118 5.92907 6.70059 6.05538C6.40001 6.18169 6.12765 6.3667 5.89946 6.59959L3.09863 9.40043C2.63436 9.8647 2.37354 10.4944 2.37354 11.151C2.37354 11.8075 2.63436 12.4372 3.09863 12.9015C3.56289 13.3657 4.19258 13.6266 4.84915 13.6266C5.50572 13.6266 6.13541 13.3657 6.59967 12.9015L6.94978 12.5514",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconLinkOutline artwork. */
const IconLinkOutlineRegular = (props) => jsx(IconLinkOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconLinkOutline artwork with a 1.3px stroke. */
const IconLinkOutlineMedium = (props) => jsx(IconLinkOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconRightUpOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M11.7256 2.77441C12.5538 2.77469 13.2256 3.44616 13.2256 4.27441V10.1416H12.2256V4.27441C12.2256 3.99844 12.0015 3.77469 11.7256 3.77441H5.7207V2.77441H11.7256Z",
		fill: "currentColor"
	}), jsx("path", {
		d: "M2.77441 13.2255L12.3756 3.62427",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconRightUpOutline artwork. */
const IconRightUpOutlineRegular = (props) => jsx(IconRightUpOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconRightUpOutline artwork with a 1.3px stroke. */
const IconRightUpOutlineMedium = (props) => jsx(IconRightUpOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconEnhanceOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M1.98486 2.95374H14.0151",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M1.98486 6.31787H14.0151",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M1.98486 9.68213H14.0151",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M1.98486 13.0463H8.4627",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconEnhanceOutline artwork. */
const IconEnhanceOutlineRegular = (props) => jsx(IconEnhanceOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconEnhanceOutline artwork with a 1.3px stroke. */
const IconEnhanceOutlineMedium = (props) => jsx(IconEnhanceOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconTrashOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M1.28149 3.88831H14.7187",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M6.44946 6.98926V11.1238",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M9.55054 6.98926V11.1238",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconTrashOutline artwork. */
const IconTrashOutlineRegular = (props) => jsx(IconTrashOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconTrashOutline artwork with a 1.3px stroke. */
const IconTrashOutlineMedium = (props) => jsx(IconTrashOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconWarningOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8 4.29199V9.79199",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8 10.708V11.708",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconWarningOutline artwork. */
const IconWarningOutlineRegular = (props) => jsx(IconWarningOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconWarningOutline artwork with a 1.3px stroke. */
const IconWarningOutlineMedium = (props) => jsx(IconWarningOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCheckCircleFillArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 36 36",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M28.1936 14.6936L19.8066 23.0806C19.2373 23.65 18.7159 24.1742 18.24 24.5571C17.7389 24.9602 17.1365 25.3359 16.3657 25.458C15.9581 25.5225 15.5428 25.5225 15.1353 25.458C14.3645 25.3359 13.7621 24.9602 13.261 24.5571C12.7851 24.1742 12.2637 23.65 11.6943 23.0806L7.80737 19.1936L10.1936 16.8074L14.0806 20.6943C14.7033 21.317 15.0763 21.6873 15.377 21.9292C15.6523 22.1507 15.7109 22.1325 15.6626 22.1248C15.7208 22.1339 15.7802 22.1339 15.8384 22.1248C15.7901 22.1325 15.8486 22.1507 16.124 21.9292C16.4247 21.6873 16.7977 21.317 17.4204 20.6943L25.8074 12.3074L28.1936 14.6936Z",
		fill: "currentColor"
	}), jsx("path", {
		d: "M32.8496 18.0005C32.8496 9.79906 26.2019 3.15137 18.0005 3.15137C9.79906 3.15137 3.15137 9.79906 3.15137 18.0005C3.15137 26.2019 9.79906 32.8496 18.0005 32.8496C26.2019 32.8496 32.8496 26.2019 32.8496 18.0005ZM35.7764 18.0005C35.7764 27.8173 27.8173 35.7764 18.0005 35.7764C8.18363 35.7764 0.224609 27.8173 0.224609 18.0005C0.224609 8.18363 8.18363 0.224609 18.0005 0.224609C27.8173 0.224609 35.7764 8.18363 35.7764 18.0005Z",
		fill: "currentColor"
	})]
});
/** Regular IconCheckCircleFill artwork (circled check); its fill-only geometry is weight-independent. */
const IconCheckCircleFillRegular = (props) => jsx(IconCheckCircleFillArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCheckCircleFill artwork; it matches Regular because the geometry is fill-only. */
const IconCheckCircleFillMedium = (props) => jsx(IconCheckCircleFillArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconWarningTriangleOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	strokeLinecap: "round",
	strokeLinejoin: "round",
	children: [jsx("path", {
		d: "M6.87 2.6a1.33 1.33 0 0 1 2.26 0l5.34 9.33A1.33 1.33 0 0 1 13.33 14H2.67a1.33 1.33 0 0 1-1.14-2.07Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M8 6v3m0 2.33h.01",
		stroke: "currentColor"
	})]
});
/** Regular rounded warning triangle with an exclamation mark. */
const IconWarningTriangleOutlineRegular = (props) => jsx(IconWarningTriangleOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium rounded warning triangle with an exclamation mark. */
const IconWarningTriangleOutlineMedium = (props) => jsx(IconWarningTriangleOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconUserOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M8 8.25C9.51878 8.25 10.75 7.01878 10.75 5.5C10.75 3.98122 9.51878 2.75 8 2.75C6.48122 2.75 5.25 3.98122 5.25 5.5C5.25 7.01878 6.48122 8.25 8 8.25Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M2.5 14.5C2.5 11.5 5.25 10.25 8 10.25C10.75 10.25 13.5 11.5 13.5 14.5",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconUserOutline artwork. */
const IconUserOutlineRegular = (props) => jsx(IconUserOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconUserOutline artwork with a 1.3px stroke. */
const IconUserOutlineMedium = (props) => jsx(IconUserOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconUsersOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M6 8.25C7.51878 8.25 8.75 7.01878 8.75 5.5C8.75 3.98122 7.51878 2.75 6 2.75C4.48122 2.75 3.25 3.98122 3.25 5.5C3.25 7.01878 4.48122 8.25 6 8.25Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M1 14.5C1 11.5 3.5 10.25 6 10.25C8.5 10.25 11 11.5 11 14.5",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M10.5 2.9C11.65 3.35 12.45 4.35 12.45 5.5C12.45 6.65 11.65 7.65 10.5 8.1",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.4 10.6C13.9 11.3 15 12.6 15 14.5",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconUsersOutline artwork: a front person with a second person behind. */
const IconUsersOutlineRegular = (props) => jsx(IconUsersOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconUsersOutline artwork with a 1.3px stroke. */
const IconUsersOutlineMedium = (props) => jsx(IconUsersOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPaperPlaneOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M4.74024 9.11029L1.82882 7.79865C1.75022 7.76323 1.75026 7.65161 1.82889 7.61626L12.9665 2.60943C13.0354 2.57846 13.1125 2.63213 13.1073 2.70749L12.3914 13.1388C12.3864 13.2117 12.3073 13.2548 12.2433 13.2194L6.12677 9.83657",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M8.44336 11.0825L6.2832 13.2843C6.22048 13.3482 6.11182 13.3038 6.11182 13.2143V9.86772C6.11182 9.84165 6.122 9.8166 6.1402 9.79793L12.972 2.78748",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconPaperPlaneOutline artwork. */
const IconPaperPlaneOutlineRegular = (props) => jsx(IconPaperPlaneOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPaperPlaneOutline artwork with a 1.3px stroke. */
const IconPaperPlaneOutlineMedium = (props) => jsx(IconPaperPlaneOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconStopFillArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M12.5 2.5H3.5C2.94772 2.5 2.5 2.94772 2.5 3.5V12.5C2.5 13.0523 2.94772 13.5 3.5 13.5H12.5C13.0523 13.5 13.5 13.0523 13.5 12.5V3.5C13.5 2.94772 13.0523 2.5 12.5 2.5Z",
		fill: "currentColor"
	})
});
/** Regular IconStopFill artwork; its fill-only geometry is weight-independent. */
const IconStopFillRegular = (props) => jsx(IconStopFillArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconStopFill artwork; it matches Regular because the geometry is fill-only. */
const IconStopFillMedium = (props) => jsx(IconStopFillArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPaperclipOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M12.75 4.5V9.5C12.75 10.7598 12.2496 11.968 11.3588 12.8588C10.468 13.7496 9.25978 14.25 8 14.25C6.74022 14.25 5.53204 13.7496 4.64124 12.8588C3.75045 11.968 3.25 10.7598 3.25 9.5V5C3.25 4.13805 3.59241 3.3114 4.2019 2.7019C4.8114 2.09241 5.63805 1.75 6.5 1.75C7.36195 1.75 8.1886 2.09241 8.7981 2.7019C9.40759 3.3114 9.75 4.13805 9.75 5V9.5C9.75 9.96413 9.56563 10.4092 9.23744 10.7374C8.90925 11.0656 8.46413 11.25 8 11.25C7.53587 11.25 7.09075 11.0656 6.76256 10.7374C6.43437 10.4092 6.25 9.96413 6.25 9.5V5.5",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconPaperclipOutline artwork. */
const IconPaperclipOutlineRegular = (props) => jsx(IconPaperclipOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPaperclipOutline artwork with a 1.3px stroke. */
const IconPaperclipOutlineMedium = (props) => jsx(IconPaperclipOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconLoadingOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M12.596 12.596C11.687 13.5049 10.5288 14.1239 9.26798 14.3747C8.00716 14.6255 6.70028 14.4968 5.51261 14.0048C4.32494 13.5129 3.30981 12.6798 2.59557 11.611C1.88134 10.5421 1.50008 9.2855 1.5 7.99998C1.50008 6.71446 1.88134 5.45783 2.59557 4.38898C3.30981 3.32013 4.32494 2.48707 5.51261 1.99513C6.70028 1.50319 8.00716 1.37447 9.26798 1.62524C10.5288 1.87602 11.687 2.49502 12.596 3.40398",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconLoadingOutline artwork. */
const IconLoadingOutlineRegular = (props) => jsx(IconLoadingOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconLoadingOutline artwork with a 1.3px stroke. */
const IconLoadingOutlineMedium = (props) => jsx(IconLoadingOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconDownloadOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M8 1.95317V10.0469",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M4.25 6.29688L8 10.0469L11.75 6.29688",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M1.5 10.0469V13.158C1.5 13.3937 1.60536 13.6198 1.79289 13.7865C1.98043 13.9532 2.23478 14.0469 2.5 14.0469H13.5C13.7652 14.0469 14.0196 13.9532 14.2071 13.7865C14.3946 13.6198 14.5 13.3937 14.5 13.158V10.0469",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconDownloadOutline artwork. */
const IconDownloadOutlineRegular = (props) => jsx(IconDownloadOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconDownloadOutline artwork with a 1.3px stroke. */
const IconDownloadOutlineMedium = (props) => jsx(IconDownloadOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPlayOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M10.3329 7.91346C10.3996 7.95195 10.3996 8.04818 10.3329 8.08667L6.78304 10.1362C6.71638 10.1747 6.63304 10.1266 6.63304 10.0496L6.63304 5.95055C6.63304 5.87357 6.71638 5.82546 6.78304 5.86395L10.3329 7.91346Z",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconPlayOutline artwork. */
const IconPlayOutlineRegular = (props) => jsx(IconPlayOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPlayOutline artwork with a 1.3px stroke. */
const IconPlayOutlineMedium = (props) => jsx(IconPlayOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPauseOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M6.5 5V11",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M9.5 5V11",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconPauseOutline artwork. */
const IconPauseOutlineRegular = (props) => jsx(IconPauseOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPauseOutline artwork with a 1.3px stroke. */
const IconPauseOutlineMedium = (props) => jsx(IconPauseOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconFullscreenOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M2.33154 9.40576V13.1685C2.3318 13.4444 2.55556 13.6685 2.83154 13.6685H6.49463V14.6685H2.83154C2.00328 14.6685 1.3318 13.9967 1.33154 13.1685V9.40576H2.33154ZM13.1685 1.33154C13.9964 1.33199 14.6683 2.00352 14.6685 2.83154V6.40576H13.6685V2.83154C13.6683 2.5558 13.4441 2.33199 13.1685 2.33154H9.49463V1.33154H13.1685Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M9.4292 6.57077L13.914 2.08594",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M6.57077 9.4292L2.08594 13.914",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconFullscreenOutline artwork. */
const IconFullscreenOutlineRegular = (props) => jsx(IconFullscreenOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconFullscreenOutline artwork with a 1.3px stroke. */
const IconFullscreenOutlineMedium = (props) => jsx(IconFullscreenOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCodeOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M6.27612 1.5L4.52612 14.5",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M11.4739 1.5L9.72388 14.5",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2.39868 5.5H14.0681",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M1.93188 10.5H13.6013",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconCodeOutline artwork. */
const IconCodeOutlineRegular = (props) => jsx(IconCodeOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCodeOutline artwork with a 1.3px stroke. */
const IconCodeOutlineMedium = (props) => jsx(IconCodeOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCordisPluginOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M3.16143 6.59068L1.75205 8.00006L3.10619 9.35419L2.39908 10.0613L0.832948 8.49517C0.559581 8.2218 0.559582 7.77831 0.832948 7.50494L2.45432 5.88357L3.16143 6.59068ZM8.49511 15.1671C8.22176 15.4405 7.77826 15.4404 7.50489 15.1671L5.93461 13.5968L6.64172 12.8897L8 14.248L9.40938 12.8386L10.1165 13.5457L8.49511 15.1671ZM15.1671 7.50494C15.4403 7.7782 15.4401 8.22179 15.1671 8.49517L13.652 10.0102L12.9449 9.30309L14.248 8.00006L12.8897 6.64178L13.5968 5.93467L15.1671 7.50494ZM9.35414 3.10624L8 1.7521L6.69696 3.05514L5.98986 2.34803L7.50489 0.833003C7.77828 0.559981 8.22186 0.559752 8.49511 0.833003L10.0612 2.39913L9.35414 3.10624Z",
		fill: "currentColor"
	}), jsx("circle", {
		cx: "8",
		cy: "8",
		r: "1.76221",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconCordisPluginOutline artwork. */
const IconCordisPluginOutlineRegular = (props) => jsx(IconCordisPluginOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCordisPluginOutline artwork with a 1.3px stroke. */
const IconCordisPluginOutlineMedium = (props) => jsx(IconCordisPluginOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconApiOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M3 4L7 8L3 12",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M9 12H13",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconApiOutline artwork. */
const IconApiOutlineRegular = (props) => jsx(IconApiOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconApiOutline artwork with a 1.3px stroke. */
const IconApiOutlineMedium = (props) => jsx(IconApiOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPersonalizationOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M3.25 7.16357C3.20417 7.32247 3.17778 7.48993 3.17773 7.66357C3.17773 7.83698 3.20336 8.00486 3.24902 8.16357H1.85742V7.16357H3.25ZM14.1426 8.16357H6.71484C6.76052 8.00485 6.78613 7.837 6.78613 7.66357C6.78609 7.48991 6.75971 7.32249 6.71387 7.16357H14.1426V8.16357Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M9.1377 11.9092C9.08596 12.0666 9.05668 12.2344 9.05664 12.4092C9.05664 12.5838 9.08606 12.7518 9.1377 12.9092H1.85742V11.9092H9.1377ZM14.1426 12.9092H12.1816C12.2332 12.7519 12.2617 12.5838 12.2617 12.4092C12.2617 12.2345 12.2333 12.0666 12.1816 11.9092H14.1426V12.9092Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M9.1123 3.09106C9.06138 3.24865 9.03324 3.41653 9.0332 3.59106C9.0332 3.76549 9.06148 3.93355 9.1123 4.09106H1.85742V3.09106H9.1123ZM14.1426 4.09106H12.207C12.2578 3.93358 12.2861 3.76545 12.2861 3.59106C12.2861 3.41657 12.2579 3.24862 12.207 3.09106H14.1426V4.09106Z",
			fill: "currentColor"
		}),
		jsx("circle", {
			cx: "4.97065",
			cy: "7.66401",
			r: "1.35151",
			stroke: "currentColor"
		}),
		jsx("circle", {
			cx: "10.6596",
			cy: "12.4091",
			r: "1.35151",
			stroke: "currentColor"
		}),
		jsx("circle", {
			cx: "10.6596",
			cy: "3.59101",
			r: "1.35151",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconPersonalizationOutline artwork. */
const IconPersonalizationOutlineRegular = (props) => jsx(IconPersonalizationOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPersonalizationOutline artwork with a 1.3px stroke. */
const IconPersonalizationOutlineMedium = (props) => jsx(IconPersonalizationOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconProjectAddOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M5.54492 2.06738C5.91034 2.06754 6.26318 2.20149 6.53711 2.44336L7.94043 3.68164V4.7998C7.71462 4.74105 7.50367 4.63139 7.32617 4.47461L5.87598 3.19238C5.78477 3.11185 5.66658 3.06754 5.54492 3.06738H2.94922C2.67322 3.06738 2.44946 3.29145 2.44922 3.56738V12.4326C2.44927 12.7087 2.67311 12.9326 2.94922 12.9326H12.9326C13.2086 12.9325 13.4326 12.7086 13.4326 12.4326V8.53613H14.4326V12.4326C14.4326 13.2609 13.7609 13.9325 12.9326 13.9326H2.94922C2.12083 13.9326 1.44927 13.261 1.44922 12.4326V3.56738C1.44946 2.73916 2.12094 2.06738 2.94922 2.06738H5.54492Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M9.75977 4.50208H14.5509",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.1492 6.89758L12.1492 2.10642",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconProjectAddOutline artwork. */
const IconProjectAddOutlineRegular = (props) => jsx(IconProjectAddOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconProjectAddOutline artwork with a 1.3px stroke. */
const IconProjectAddOutlineMedium = (props) => jsx(IconProjectAddOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconFolderOpenOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M12.3994 13.5986H2.04956C1.49728 13.5986 1.04956 13.1509 1.04956 12.5986V3.40137C1.04956 2.84908 1.49728 2.40137 2.04956 2.40137H4.76632C5.01016 2.40137 5.24561 2.49046 5.42836 2.6519L6.94088 3.98799C7.12364 4.14943 7.35908 4.23852 7.60293 4.23852H12.3994C12.9517 4.23852 13.3994 4.68624 13.3994 5.23852V7.16991",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M2.55911 7.93683C2.67584 7.49906 3.07229 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55911 7.93683Z",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconFolderOpenOutline artwork. */
const IconFolderOpenOutlineRegular = (props) => jsx(IconFolderOpenOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconFolderOpenOutline artwork with a 1.3px stroke. */
const IconFolderOpenOutlineMedium = (props) => jsx(IconFolderOpenOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconFolderOpenArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M2.55912 7.93683C2.67584 7.49906 3.0723 7.19446 3.52536 7.19446H13.6491C14.3061 7.19446 14.7846 7.81725 14.6153 8.45209L13.4411 12.856C13.3244 13.2938 12.9279 13.5984 12.4748 13.5984H2.35113C1.69411 13.5984 1.21562 12.9756 1.38489 12.3407L2.55912 7.93683Z",
			fill: "currentColor",
			opacity: "0.16"
		}),
		jsx("path", {
			d: "M13.6491 6.69446C14.6346 6.69453 15.3522 7.62895 15.0983 8.58118L13.9245 12.9845C13.7494 13.6412 13.1539 14.0988 12.4743 14.0988H2.35126C1.36574 14.0988 0.648153 13.1643 0.902044 12.212L2.07587 7.80774C2.25102 7.15128 2.84567 6.69455 3.52509 6.69446H13.6491ZM3.52509 7.69446C3.29865 7.69455 3.10004 7.84674 3.04169 8.06555L1.86786 12.4698C1.78345 12.7872 2.02285 13.0988 2.35126 13.0988H12.4743C12.7007 13.0988 12.8992 12.9463 12.9577 12.7277L14.1325 8.32336C14.2171 8.00598 13.9776 7.69453 13.6491 7.69446H3.52509Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M4.7666 1.90137C5.13227 1.90144 5.48571 2.03525 5.75977 2.27734L7.27246 3.61328C7.36379 3.69382 7.48174 3.73828 7.60352 3.73828H12.3994C13.2276 3.73841 13.8993 4.41005 13.8994 5.23828V6.7168C13.8183 6.70327 13.735 6.69436 13.6494 6.69434H12.8994V5.23828C12.8993 4.96233 12.6754 4.73841 12.3994 4.73828H7.60352C7.23781 4.73828 6.88446 4.60438 6.61035 4.3623L5.09766 3.02637C5.00636 2.94576 4.88838 2.90144 4.7666 2.90137H2.0498C1.77366 2.90137 1.5498 3.12523 1.5498 3.40137V9.78223L0.902344 12.2119C0.648452 13.1642 1.36604 14.0986 2.35156 14.0986H2.0498C1.2214 14.0986 0.549838 13.427 0.549805 12.5986V3.40137C0.549805 2.57294 1.22138 1.90137 2.0498 1.90137H4.7666Z",
			fill: "currentColor"
		})
	]
});
/** Regular IconFolderOpen artwork; its fill-only geometry is weight-independent. */
const IconFolderOpenRegular = (props) => jsx(IconFolderOpenArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconFolderOpen artwork; it matches Regular because the geometry is fill-only. */
const IconFolderOpenMedium = (props) => jsx(IconFolderOpenArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
/** Regular one-pixel IconFolderClose artwork. */
const IconFolderCloseRegular = (props) => jsx(FolderCloseArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconFolderClose artwork with a 1.3px stroke. */
const IconFolderCloseMedium = (props) => jsx(FolderCloseArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconTreeCornerArtwork = ({ size = 10, className, strokeWidth }) => jsx("svg", {
	width: size * 8 / 10,
	height: size,
	className,
	viewBox: "0 0 9 11",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M0.5 0V7C0.5 7.79565 0.81607 8.55871 1.37868 9.12132C1.94129 9.68393 2.70435 10 3.5 10H8.5",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconTreeCorner artwork. */
const IconTreeCornerRegular = (props) => jsx(IconTreeCornerArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconTreeCorner artwork with a 1.3px stroke. */
const IconTreeCornerMedium = (props) => jsx(IconTreeCornerArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconLightOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M8.00007 11.8117C10.1052 11.8117 11.8117 10.1052 11.8117 8.00007C11.8117 5.89499 10.1052 4.18848 8.00007 4.18848C5.89499 4.18848 4.18848 5.89499 4.18848 8.00007C4.18848 10.1052 5.89499 11.8117 8.00007 11.8117Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M13.3899 8H15.1499",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M11.8115 11.8115L13.0556 13.0556",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8 13.3901V15.1501",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M4.18868 11.8115L2.94458 13.0556",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2.6101 8H0.850098",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M4.18868 4.18856L2.94458 2.94446",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8 2.6101V0.850098",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M11.8115 4.18856L13.0556 2.94446",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconLightOutline artwork. */
const IconLightOutlineRegular = (props) => jsx(IconLightOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconLightOutline artwork with a 1.3px stroke. */
const IconLightOutlineMedium = (props) => jsx(IconLightOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconDarkOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: "M14.1127 8.70663C14.2576 8.60602 14.4627 8.71355 14.4386 8.88834C14.2901 9.96567 13.8731 10.9912 13.2229 11.8692C12.479 12.8735 11.4613 13.6421 10.2917 14.0829C9.1222 14.5236 7.85038 14.6179 6.62865 14.3543C5.40692 14.0907 4.28709 13.4805 3.40332 12.5967C2.51955 11.7129 1.90931 10.5931 1.64572 9.37135C1.38212 8.14962 1.47635 6.87779 1.91711 5.70825C2.35787 4.5387 3.12647 3.52103 4.13083 2.77714C5.00878 2.12689 6.03433 1.70994 7.11166 1.5614C7.28645 1.5373 7.39397 1.74238 7.29337 1.88734C6.68703 2.76099 6.37885 3.81241 6.42313 4.88345C6.47392 6.11194 6.98471 7.27645 7.85413 8.14587C8.72355 9.01529 9.88805 9.52608 11.1166 9.57687C12.1876 9.62114 13.239 9.31296 14.1127 8.70663Z",
		stroke: "currentColor"
	})
});
/** Regular one-pixel IconDarkOutline artwork. */
const IconDarkOutlineRegular = (props) => jsx(IconDarkOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconDarkOutline artwork with a 1.3px stroke. */
const IconDarkOutlineMedium = (props) => jsx(IconDarkOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconFollowsystemOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V11.5C1.5 12.0523 1.94772 12.5 2.5 12.5H13.5C14.0523 12.5 14.5 12.0523 14.5 11.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M5 14.5H11",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconFollowsystemOutline artwork. */
const IconFollowsystemOutlineRegular = (props) => jsx(IconFollowsystemOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconFollowsystemOutline artwork with a 1.3px stroke. */
const IconFollowsystemOutlineMedium = (props) => jsx(IconFollowsystemOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconDataOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M7.8667 0.349609C8.96906 0.349634 10.0601 0.481272 11.0317 0.735352C11.9973 0.987845 12.8453 1.362 13.4644 1.84766C14.0744 2.32629 14.507 2.95539 14.5161 3.69336H14.5171V8.53516C14.0843 8.32076 13.6108 8.17679 13.1108 8.11816C13.1831 7.96848 13.2162 7.82856 13.2163 7.70312V5.76758C12.6269 6.16618 11.8739 6.47995 11.0317 6.7002C10.0602 6.95423 8.96896 7.08494 7.8667 7.08496C6.76461 7.08493 5.67411 6.95415 4.70264 6.7002C3.85994 6.48006 3.10694 6.1662 2.51709 5.76758V7.70312L2.521 7.78418C2.56374 8.19554 2.93361 8.74414 3.91357 9.23145C4.9281 9.73585 6.35004 10.0371 7.8667 10.0371C8.26373 10.0371 8.6543 10.0141 9.03271 9.97461C8.75596 10.3799 8.54664 10.8349 8.42041 11.3232C8.23666 11.3313 8.0518 11.3369 7.8667 11.3369C6.20108 11.3369 4.57025 11.01 3.33447 10.3955C3.04163 10.2499 2.76658 10.0836 2.51709 9.90039V11.6738C2.51728 12.1379 2.88589 12.7556 3.92236 13.292C4.93457 13.8157 6.35342 14.1289 7.8667 14.1289C8.12318 14.1289 8.37694 14.1161 8.62646 14.0986C8.82021 14.5535 9.08999 14.9682 9.41943 15.3271C8.91285 15.3934 8.39149 15.4287 7.8667 15.4287C6.19761 15.4287 4.56379 15.0869 3.32568 14.4463C2.11244 13.8185 1.21649 12.8562 1.21631 11.6738V3.76367C1.21595 3.74853 1.21438 3.733 1.21436 3.71777C1.21436 2.96917 1.65103 2.33053 2.26807 1.84668C2.88747 1.36112 3.73675 0.987685 4.70264 0.735352C5.67413 0.481376 6.76457 0.349636 7.8667 0.349609ZM7.8667 1.65039C6.86269 1.65042 5.88326 1.77028 5.03076 1.99316C4.17183 2.2176 3.50421 2.52956 3.06982 2.87012C2.65043 3.19909 2.52622 3.48898 2.51709 3.69336V3.74414C2.52719 3.94845 2.65185 4.23772 3.06982 4.56543C3.50425 4.90601 4.17172 5.21795 5.03076 5.44238C5.88326 5.66527 6.8627 5.78513 7.8667 5.78516C8.8707 5.78513 9.85015 5.66525 10.7026 5.44238C11.5611 5.21787 12.2286 4.9049 12.6626 4.56445C13.0982 4.22252 13.2163 3.9231 13.2163 3.71777L13.2104 3.63574C13.1818 3.43623 13.044 3.16941 12.6626 2.87012C12.2286 2.52957 11.5614 2.21773 10.7026 1.99316C9.85009 1.77025 8.8708 1.65041 7.8667 1.65039Z",
		fill: "currentColor"
	}), jsx("path", {
		d: "M12.8936 10.0361L13.2061 10.5566C13.2296 10.5959 13.2651 10.6562 13.3027 10.707C13.3469 10.7666 13.4148 10.8431 13.5195 10.9023C13.6244 10.9617 13.725 10.9801 13.7988 10.9873C13.8619 10.9934 13.9318 10.9932 13.9775 10.9932H14.6162L14.8896 11.4502L14.5947 11.9443C14.5698 11.9859 14.5312 12.0483 14.5029 12.1084C14.4781 12.1611 14.4514 12.2312 14.4395 12.3164L14.4326 12.4072L14.4395 12.4971C14.4514 12.5825 14.4781 12.6532 14.5029 12.7061C14.5312 12.7661 14.5689 12.8287 14.5938 12.8701L14.8896 13.3633L14.6162 13.8213H13.9775C13.9318 13.8213 13.8619 13.821 13.7988 13.8271C13.7433 13.8326 13.6728 13.8442 13.5967 13.875L13.5195 13.9121C13.4148 13.9714 13.3469 14.0478 13.3027 14.1074C13.265 14.1583 13.2296 14.2186 13.2061 14.2578L12.8936 14.7783H12.3115L11.999 14.2578C11.9755 14.2186 11.9401 14.1583 11.9023 14.1074C11.8693 14.0628 11.823 14.0083 11.7578 13.959L11.6855 13.9121L11.6074 13.875C11.5316 13.8445 11.4615 13.8325 11.4062 13.8271C11.3432 13.821 11.2733 13.8213 11.2275 13.8213H10.5889L10.3135 13.3633L10.6104 12.8701C10.6352 12.8287 10.6739 12.7661 10.7021 12.7061C10.7352 12.6357 10.7724 12.534 10.7725 12.4072C10.7724 12.2804 10.7352 12.1788 10.7021 12.1084C10.6739 12.0483 10.6353 11.9859 10.6104 11.9443L10.3135 11.4502L10.5889 10.9932H11.2275C11.2733 10.9932 11.3432 10.9934 11.4062 10.9873C11.4801 10.9801 11.5808 10.9616 11.6855 10.9023C11.7903 10.843 11.8582 10.7666 11.9023 10.707C11.94 10.6562 11.9755 10.5959 11.999 10.5566L12.3115 10.0361H12.8936Z",
		stroke: "currentColor",
		strokeMiterlimit: "10"
	})]
});
/** Regular one-pixel IconDataOutline artwork. */
const IconDataOutlineRegular = (props) => jsx(IconDataOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconDataOutline artwork with a 1.3px stroke. */
const IconDataOutlineMedium = (props) => jsx(IconDataOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconDatabaseOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M13.1967 5.1869C13.7232 4.77378 14.0003 4.30517 14.0001 3.82819C14.0003 3.3512 13.7232 2.88259 13.1967 2.46947C12.6702 2.05635 11.9128 1.71328 11.0006 1.47475C10.0885 1.23621 9.05371 1.11062 8.00039 1.1106C6.94707 1.11057 5.9123 1.23612 5.00009 1.47461C4.08742 1.71301 3.32948 2.05604 2.80249 2.46919C2.2755 2.88235 1.99805 3.35106 1.99805 3.82819C1.99805 4.30531 2.2755 4.77402 2.80249 5.18718C3.32948 5.60033 4.08742 5.94336 5.00009 6.18176C5.9123 6.42025 6.94707 6.5458 8.00039 6.54578C9.05371 6.54575 10.0885 6.42016 11.0006 6.18163C11.9128 5.94309 12.6702 5.60002 13.1967 5.1869Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2 3.80371V11.7848",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M14 3.80371V11.7848",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2 7.81396C2 8.60524 2.63214 9.36411 3.75736 9.92363C4.88258 10.4832 6.4087 10.7975 8 10.7975C9.5913 10.7975 11.1174 10.4832 12.2426 9.92363C13.3679 9.36411 14 8.60524 14 7.81396",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2 11.7847C2 12.6081 2.63214 13.3977 3.75736 13.98C4.88258 14.5622 6.4087 14.8893 8 14.8893C9.5913 14.8893 11.1174 14.5622 12.2426 13.98C13.3679 13.3977 14 12.6081 14 11.7847",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconDatabaseOutline artwork. */
const IconDatabaseOutlineRegular = (props) => jsx(IconDatabaseOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconDatabaseOutline artwork with a 1.3px stroke. */
const IconDatabaseOutlineMedium = (props) => jsx(IconDatabaseOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconClockOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M8 4.31V8.46L11 10.08",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconClockOutline artwork. */
const IconClockOutlineRegular = (props) => jsx(IconClockOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconClockOutline artwork with a 1.3px stroke. */
const IconClockOutlineMedium = (props) => jsx(IconClockOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconGaugeOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M3.4041 13.096C2.49514 12.187 1.87614 11.0288 1.62537 9.76798C1.37459 8.50716 1.50331 7.20028 1.99525 6.01261C2.48719 4.82494 3.32025 3.80981 4.3891 3.09557C5.45795 2.38134 6.71458 2.00008 8.0001 2C9.28563 2.00008 10.5423 2.38134 11.6111 3.09557C12.68 3.80981 13.513 4.82494 14.005 6.01261C14.4969 7.20028 14.6256 8.50716 14.3748 9.76798C14.1241 11.0288 13.5051 12.187 12.5961 13.096",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8 8.49994L11.6114 4.88855",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8 9.75C8.69036 9.75 9.25 9.19036 9.25 8.5C9.25 7.80964 8.69036 7.25 8 7.25C7.30964 7.25 6.75 7.80964 6.75 8.5C6.75 9.19036 7.30964 9.75 8 9.75Z",
			fill: "currentColor"
		})
	]
});
/** Regular one-pixel IconGaugeOutline artwork. */
const IconGaugeOutlineRegular = (props) => jsx(IconGaugeOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconGaugeOutline artwork with a 1.3px stroke. */
const IconGaugeOutlineMedium = (props) => jsx(IconGaugeOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconSendOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M6.97211 1.94476C7.55785 1.35914 8.50767 1.35919 9.09343 1.94476L13.921 6.77228L13.2138 7.47939L8.38632 2.65187C8.19108 2.45682 7.87443 2.45677 7.67922 2.65187L2.74397 7.58711L2.03687 6.88L6.97211 1.94476Z",
		fill: "currentColor"
	}), jsx("path", {
		d: "M7.97571 14.5732L8.02421 2.34139",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconSendOutline artwork. */
const IconSendOutlineRegular = (props) => jsx(IconSendOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconSendOutline artwork with a 1.3px stroke. */
const IconSendOutlineMedium = (props) => jsx(IconSendOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconQueueOutlineArtwork = ({ size = 14, ...rest }) => jsx(ChatLinesOutlineArtwork, {
	size,
	...rest
});
/** Regular one-pixel IconQueueOutline artwork. */
const IconQueueOutlineRegular = (props) => jsx(IconQueueOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconQueueOutline artwork with a 1.3px stroke. */
const IconQueueOutlineMedium = (props) => jsx(IconQueueOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconChecklistOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M3.75 6.25C4.7165 6.25 5.5 5.4665 5.5 4.5C5.5 3.5335 4.7165 2.75 3.75 2.75C2.7835 2.75 2 3.5335 2 4.5C2 5.4665 2.7835 6.25 3.75 6.25Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M7.5 4.5H13.5",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M3.75 13.25C4.7165 13.25 5.5 12.4665 5.5 11.5C5.5 10.5335 4.7165 9.75 3.75 9.75C2.7835 9.75 2 10.5335 2 11.5C2 12.4665 2.7835 13.25 3.75 13.25Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M7.5 11.5H13.5",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconChecklistOutline artwork. */
const IconChecklistOutlineRegular = (props) => jsx(IconChecklistOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconChecklistOutline artwork with a 1.3px stroke. */
const IconChecklistOutlineMedium = (props) => jsx(IconChecklistOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconListPenOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M4.9375 5.90295H11.0625",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M4.9375 9.02991H8.27841",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.5 1.32617C13.3039 1.32617 14 1.95171 14 2.77637V7.61328L13 8.68164V2.77637C13 2.55186 12.8007 2.32617 12.5 2.32617H3.5C3.1993 2.32617 3 2.55186 3 2.77637V13.2246C3.00044 13.4489 3.19963 13.6738 3.5 13.6738H8.32812L7.39258 14.6738H3.5C2.69637 14.6738 2.00042 14.0489 2 13.2246V2.77637C2 1.95171 2.69613 1.32617 3.5 1.32617H12.5Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M8.97212 14.3693C9.17511 14.5723 9.37811 14.7753 9.5811 14.9783C9.67012 14.8953 9.75914 14.8123 9.84815 14.7293C11.4505 13.2352 13.0528 11.7411 14.6551 10.247C14.7441 10.164 14.8331 10.081 14.9221 9.99803C14.5989 9.6748 14.2756 9.35157 13.9524 9.02834C13.8694 9.11736 13.7864 9.20637 13.7034 9.29539C12.2093 10.8977 10.7152 12.5 9.22113 14.1023C9.13813 14.1913 9.05513 14.2803 8.97212 14.3693Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M11.6323 13.7841C11.6323 14.0395 11.6323 14.295 11.6323 14.5504C11.6812 14.5523 11.7301 14.5543 11.779 14.5562C12.659 14.5913 13.539 14.6263 14.419 14.6614C14.4679 14.6633 14.5168 14.6653 14.5657 14.6672C14.5657 14.3339 14.5657 14.0006 14.5657 13.6672C14.5168 13.6692 14.4679 13.6711 14.419 13.6731C13.539 13.7081 12.659 13.7432 11.779 13.7783C11.7301 13.7802 11.6812 13.7821 11.6323 13.7841Z",
			fill: "currentColor"
		})
	]
});
/** Regular one-pixel IconListPenOutline artwork. */
const IconListPenOutlineRegular = (props) => jsx(IconListPenOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconListPenOutline artwork with a 1.3px stroke. */
const IconListPenOutlineMedium = (props) => jsx(IconListPenOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconGoalOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M11.5 8C11.5001 8.69227 11.2948 9.36901 10.9102 9.94463C10.5257 10.5202 9.97901 10.9689 9.33944 11.2338C8.69986 11.4987 7.99609 11.5681 7.31712 11.433C6.63816 11.2979 6.01449 10.9645 5.52501 10.475C5.03548 9.98552 4.70209 9.36185 4.56702 8.68289C4.43195 8.00392 4.50127 7.30015 4.76619 6.66057C5.03112 6.021 5.47976 5.47436 6.05538 5.08978C6.631 4.70519 7.30774 4.49995 8.00001 4.5",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8.00024 7.99976L11.2 4.80005",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.4719 5.62245C12.4246 5.66972 12.3569 5.69025 12.2913 5.67715L10.7814 5.37555C10.7022 5.35972 10.6402 5.29781 10.6244 5.2186L10.3228 3.70866C10.3097 3.6431 10.3302 3.57533 10.3775 3.52806L12.1826 1.723C12.2863 1.61929 12.4627 1.65879 12.5122 1.79684L12.9271 2.95225C12.9472 3.00847 12.9915 3.05272 13.0477 3.07291L14.2031 3.48774C14.3412 3.5373 14.3807 3.71368 14.277 3.81739L12.4719 5.62245Z",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconGoalOutline artwork. */
const IconGoalOutlineRegular = (props) => jsx(IconGoalOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconGoalOutline artwork with a 1.3px stroke. */
const IconGoalOutlineMedium = (props) => jsx(IconGoalOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconSparkleArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M5.875 3C5.875 6.33333 7.54167 8 10.875 8C7.54167 8 5.875 9.66667 5.875 13C5.875 9.66667 4.20833 8 0.875 8C4.20833 8 5.875 6.33333 5.875 3Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.375 1.55823C12.375 3.39156 13.2917 4.30823 15.125 4.30823C13.2917 4.30823 12.375 5.22489 12.375 7.05823C12.375 5.22489 11.4583 4.30823 9.625 4.30823C11.4583 4.30823 12.375 3.39156 12.375 1.55823Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.375 10.4418C12.375 11.7751 13.0417 12.4418 14.375 12.4418C13.0417 12.4418 12.375 13.1084 12.375 14.4418C12.375 13.1084 11.7083 12.4418 10.375 12.4418C11.7083 12.4418 12.375 11.7751 12.375 10.4418Z",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconSparkle artwork. */
const IconSparkleRegular = (props) => jsx(IconSparkleArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconSparkle artwork with a 1.3px stroke. */
const IconSparkleMedium = (props) => jsx(IconSparkleArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
/** Regular one-pixel IconInspectOutline artwork. */
const IconInspectOutlineRegular = (props) => jsx(CodeBracketsArtwork, {
	...props,
	size: props.size ?? 12,
	strokeWidth: 1
});
/** Medium IconInspectOutline artwork with a 1.3px stroke. */
const IconInspectOutlineMedium = (props) => jsx(CodeBracketsArtwork, {
	...props,
	size: props.size ?? 12,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconSkillOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 17 17",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M4.57788 5.77124H10.7029",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M4.57788 8.89819H7.91879",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.1404 1.19446C12.9442 1.19446 13.6404 1.81999 13.6404 2.64465V8.89856H12.6404V2.64465C12.6404 2.42015 12.4411 2.19446 12.1404 2.19446H3.14038C2.83968 2.19446 2.64038 2.42015 2.64038 2.64465V13.0929C2.64082 13.3172 2.84001 13.5421 3.14038 13.5421H8.88159V14.5421H3.14038C2.33675 14.5421 1.6408 13.9172 1.64038 13.0929V2.64465C1.64038 1.81999 2.33651 1.19446 3.14038 1.19446H12.1404Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M12.0051 15.1056C12.0051 13.6395 10.8166 12.451 9.35059 12.451C10.8166 12.451 12.0051 11.2626 12.0051 9.79651C12.0051 11.2626 13.1936 12.451 14.6597 12.451C13.1936 12.451 12.0051 13.6395 12.0051 15.1056Z",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconSkillOutline artwork. */
const IconSkillOutlineRegular = (props) => jsx(IconSkillOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconSkillOutline artwork with a 1.3px stroke. */
const IconSkillOutlineMedium = (props) => jsx(IconSkillOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconQuestionOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M5.75 6.69646C5.75 6.29865 5.88196 5.90976 6.12919 5.57899C6.37643 5.24821 6.72783 4.99041 7.13896 4.83817C7.5501 4.68593 8.0025 4.6461 8.43895 4.72371C8.87541 4.80132 9.27632 4.99289 9.59099 5.27419C9.90566 5.55549 10.12 5.91388 10.2068 6.30406C10.2936 6.69423 10.249 7.09866 10.0787 7.4662C9.90843 7.83373 9.62004 8.14787 9.25003 8.36889C9.19476 8.4019 9.13803 8.43262 9.08004 8.46099C8.52566 8.73217 8 9.20817 8 9.82532",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8 10.7416V11.7416",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconQuestionOutline artwork. */
const IconQuestionOutlineRegular = (props) => jsx(IconQuestionOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconQuestionOutline artwork with a 1.3px stroke. */
const IconQuestionOutlineMedium = (props) => jsx(IconQuestionOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconInfoOutlineArtwork = ({ size = 14, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 14 14",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M12.5757 7.00012C12.5757 3.92085 10.0794 1.42463 7.00012 1.42456C3.9208 1.42456 1.42456 3.9208 1.42456 7.00012C1.42463 10.0794 3.92085 12.5757 7.00012 12.5757C10.0793 12.5756 12.5756 10.0793 12.5757 7.00012ZM13.8002 7.00012C13.8001 10.7559 10.7559 13.8001 7.00012 13.8002C3.2443 13.8002 0.199291 10.7559 0.199219 7.00012C0.199219 3.24426 3.24426 0.199219 7.00012 0.199219C10.7559 0.199291 13.8002 3.2443 13.8002 7.00012Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M7.6127 3.18921V4.55986H6.38735V3.18921H7.6127Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M7.6127 5.68921V10.8109H6.38735V5.68921H7.6127Z",
			fill: "currentColor"
		})
	]
});
/** Regular IconInfoOutline artwork; its fill-only geometry is weight-independent. */
const IconInfoOutlineRegular = (props) => jsx(IconInfoOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconInfoOutline artwork; its fill-only geometry is weight-independent. */
const IconInfoOutlineMedium = (props) => jsx(IconInfoOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPluginPinwheelOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M7.84457 5.06199C11.6605 4.93876 14.7962 6.14848 14.8484 7.76397C14.8875 8.97461 13.1838 10.0696 10.7215 10.5942",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M5.12742 8.07731C5.00419 4.26138 6.21391 1.12568 7.8294 1.07351C9.04004 1.03441 10.135 2.73808 10.6596 5.20037",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8.02457 10.6802C4.20865 10.8034 1.07294 9.5937 1.02077 7.97821C0.981678 6.76758 2.68535 5.67262 5.14763 5.14798",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M10.7476 7.89535C10.8708 11.7113 9.66109 14.847 8.0456 14.8991C6.83496 14.9382 5.74 13.2346 5.21536 10.7723",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel plugin pinwheel artwork. */
const IconPluginPinwheelOutlineRegular = (props) => jsx(IconPluginPinwheelOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium plugin pinwheel artwork with a 1.3px stroke. */
const IconPluginPinwheelOutlineMedium = (props) => jsx(IconPluginPinwheelOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconAlarmClockOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 17 17",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M4.09372 11.9895L3.11865 14.0387",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M12.1392 11.9895L13.1143 14.0387",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8.11646 4.78442V8.03442L10.6165 9.53442",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8.11646 13.4094C11.154 13.4094 13.6165 10.947 13.6165 7.90942C13.6165 4.87186 11.154 2.40942 8.11646 2.40942C5.07889 2.40942 2.61646 4.87186 2.61646 7.90942C2.61646 10.947 5.07889 13.4094 8.11646 13.4094Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M1.75952 4.74323C2.30657 3.65639 3.12646 2.73047 4.12926 2.05542",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M14.3345 4.74323C13.7874 3.65639 12.9675 2.73047 11.9647 2.05542",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconAlarmClockOutline artwork. */
const IconAlarmClockOutlineRegular = (props) => jsx(IconAlarmClockOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconAlarmClockOutline artwork with a 1.3px stroke. */
const IconAlarmClockOutlineMedium = (props) => jsx(IconAlarmClockOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconArchiveOutlineArtwork = ({ size = 20, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V4.5C1.5 5.05228 1.94772 5.5 2.5 5.5H13.5C14.0523 5.5 14.5 5.05228 14.5 4.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2.5 5.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V5.5",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M6.5 9.5H9.5",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconArchiveOutline artwork. */
const IconArchiveOutlineRegular = (props) => jsx(IconArchiveOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconArchiveOutline artwork with a 1.3px stroke. */
const IconArchiveOutlineMedium = (props) => jsx(IconArchiveOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconWrapLinesOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M2.3457 3.19299H13.6541",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2.3457 7.46497H9.19332",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M2.3457 11.7369H6.4849",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M9.1936 7.46497H11.5183C12.6981 7.46497 13.6544 8.42132 13.6544 9.60103C13.6544 10.7808 12.6981 11.7371 11.5183 11.7371H9.1936",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M10.9505 9.7677L9.12262 11.5956C9.04452 11.6737 9.04452 11.8003 9.12262 11.8784L10.9505 13.7063",
			stroke: "currentColor"
		})
	]
});
/** Regular one-pixel IconWrapLinesOutline artwork. */
const IconWrapLinesOutlineRegular = (props) => jsx(IconWrapLinesOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconWrapLinesOutline artwork with a 1.3px stroke. */
const IconWrapLinesOutlineMedium = (props) => jsx(IconWrapLinesOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconNowrapFillArtwork = ({ size = 16, className }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	children: [
		jsx("path", {
			d: "M2 15H1V1H2V15Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M12.3535 7.64645C12.5487 7.84171 12.5487 8.15829 12.3535 8.35355L9.85352 10.8535L9.14648 10.1465L10.793 8.5H3.5V7.5H10.793L9.14648 5.85352L9.85352 5.14648L12.3535 7.64645Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M15 15H14V1H15V15Z",
			fill: "currentColor"
		})
	]
});
/** Regular IconNowrapFill artwork; fill-only weights render identically. */
const IconNowrapFillRegular = (props) => jsx(IconNowrapFillArtwork, { ...props });
/** Medium IconNowrapFill artwork; fill-only weights render identically. */
const IconNowrapFillMedium = (props) => jsx(IconNowrapFillArtwork, { ...props });
const IconWrapFillArtwork = ({ size = 16, className }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	children: [
		jsx("path", {
			d: "M10.9999 8C10.9999 6.89543 10.1046 6 9 6H4.5V5H9C10.6568 5 11.9999 6.34315 11.9999 8C11.9999 9.65685 10.6568 11 9 11H6.20703L6.85351 11.6465L6.14648 12.3535L4.64652 10.8536C4.45126 10.6583 4.45126 10.3417 4.64652 10.1464L6.14648 8.64648L6.85351 9.35352L6.20703 10H9C10.1046 10 10.9999 9.10457 10.9999 8Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M2 15H1V1H2V15Z",
			fill: "currentColor"
		}),
		jsx("path", {
			d: "M15 15H14V1H15V15Z",
			fill: "currentColor"
		})
	]
});
/** Regular IconWrapFill artwork; fill-only weights render identically. */
const IconWrapFillRegular = (props) => jsx(IconWrapFillArtwork, { ...props });
/** Medium IconWrapFill artwork; fill-only weights render identically. */
const IconWrapFillMedium = (props) => jsx(IconWrapFillArtwork, { ...props });
const IconCompareSplitOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M6 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H6C6.55228 14.5 7 14.0523 7 13.5V2.5C7 1.94772 6.55228 1.5 6 1.5Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M13.5 1.5H10C9.44772 1.5 9 1.94772 9 2.5V13.5C9 14.0523 9.44772 14.5 10 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconCompareSplitOutline artwork. */
const IconCompareSplitOutlineRegular = (props) => jsx(IconCompareSplitOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCompareSplitOutline artwork with a 1.3px stroke. */
const IconCompareSplitOutlineMedium = (props) => jsx(IconCompareSplitOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPlanOutlineArtwork = (props) => jsx(IconListPenOutlineArtwork, {
	...props,
	size: props.size ?? 14
});
/** Regular one-pixel IconPlanOutline artwork. */
const IconPlanOutlineRegular = (props) => jsx(IconPlanOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPlanOutline artwork with a 1.3px stroke. */
const IconPlanOutlineMedium = (props) => jsx(IconPlanOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCompactOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		opacity: "0.35",
		d: "M8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M8 1.5C8.85359 1.5 9.69883 1.66813 10.4874 1.99478C11.2761 2.32144 11.9926 2.80022 12.5962 3.40381C13.1998 4.00739 13.6786 4.72394 14.0052 5.51256C14.3319 6.30117 14.5 7.14641 14.5 8",
		stroke: "currentColor"
	})]
});
/** Regular one-pixel IconCompactOutline artwork. */
const IconCompactOutlineRegular = (props) => jsx(IconCompactOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCompactOutline artwork with a 1.3px stroke. */
const IconCompactOutlineMedium = (props) => jsx(IconCompactOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconShieldOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsx("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: jsx("path", {
		d: SHIELD_OUTLINE_PATH,
		stroke: "currentColor",
		strokeLinejoin: "round"
	})
});
/** Regular one-pixel IconShieldOutline artwork. */
const IconShieldOutlineRegular = (props) => jsx(IconShieldOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconShieldOutline artwork with a 1.3px stroke. */
const IconShieldOutlineMedium = (props) => jsx(IconShieldOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconCheckCircleOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M12.5303 6.53027L8.80273 10.2578C8.54967 10.5109 8.31796 10.7439 8.10645 10.9141C7.88375 11.0932 7.616 11.2602 7.27344 11.3145C7.09229 11.3431 6.90771 11.3431 6.72656 11.3145C6.384 11.2602 6.11625 11.0932 5.89355 10.9141C5.68204 10.7439 5.45033 10.5109 5.19727 10.2578L3.46973 8.53027L4.53027 7.46973L6.25781 9.19727C6.53457 9.47402 6.70036 9.63859 6.83398 9.74609C6.95637 9.84453 6.98241 9.83644 6.96094 9.83301C6.98679 9.83709 7.01321 9.83709 7.03906 9.83301C7.01759 9.83644 7.04363 9.84453 7.16602 9.74609C7.29964 9.63859 7.46543 9.47402 7.74219 9.19727L11.4697 5.46973L12.5303 6.53027Z",
		fill: "currentColor"
	}), jsx("path", {
		d: "M14.5996 8C14.5996 4.35492 11.6451 1.40039 8 1.40039C4.35492 1.40039 1.40039 4.35492 1.40039 8C1.40039 11.6451 4.35492 14.5996 8 14.5996C11.6451 14.5996 14.5996 11.6451 14.5996 8ZM15.9004 8C15.9004 12.363 12.363 15.9004 8 15.9004C3.63695 15.9004 0.0996094 12.363 0.0996094 8C0.0996094 3.63695 3.63695 0.0996094 8 0.0996094C12.363 0.0996094 15.9004 3.63695 15.9004 8Z",
		fill: "currentColor"
	})]
});
/** Regular one-pixel IconCheckCircleOutline artwork. */
const IconCheckCircleOutlineRegular = (props) => jsx(IconCheckCircleOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconCheckCircleOutline artwork with a 1.3px stroke. */
const IconCheckCircleOutlineMedium = (props) => jsx(IconCheckCircleOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconUnarchiveOutlineArtwork = ({ size = 20, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 20 20",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		fillRule: "evenodd",
		clipRule: "evenodd",
		d: "M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z",
		fill: "currentColor"
	}), jsx("path", {
		d: "M10 14.1V10.1M7.85 12.05L10 9.9L12.15 12.05",
		stroke: "currentColor",
		strokeLinecap: "round",
		strokeLinejoin: "round"
	})]
});
/** Regular one-pixel IconUnarchiveOutline artwork. */
const IconUnarchiveOutlineRegular = (props) => jsx(IconUnarchiveOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconUnarchiveOutline artwork with a 1.3px stroke. */
const IconUnarchiveOutlineMedium = (props) => jsx(IconUnarchiveOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPinOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z",
		stroke: "currentColor",
		strokeLinejoin: "round"
	}), jsx("path", {
		d: "M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z",
		fill: "currentColor"
	})]
});
/** Regular one-pixel IconPinOutline artwork. */
const IconPinOutlineRegular = (props) => jsx(IconPinOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPinOutline artwork with a 1.3px stroke. */
const IconPinOutlineMedium = (props) => jsx(IconPinOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconPinFillArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z",
		fill: "currentColor",
		stroke: "currentColor",
		strokeLinejoin: "round"
	}), jsx("path", {
		d: "M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z",
		fill: "currentColor"
	})]
});
/** Regular one-pixel IconPinFill artwork. */
const IconPinFillRegular = (props) => jsx(IconPinFillArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconPinFill artwork with a 1.3px stroke. */
const IconPinFillMedium = (props) => jsx(IconPinFillArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconFlatListOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	stroke: "currentColor",
	strokeLinecap: "round",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", { d: "M6 3.5h7.5M6 8h7.5M6 12.5h7.5" }), jsx("path", { d: "M2.6 3.5h.01M2.6 8h.01M2.6 12.5h.01" })]
});
/** Regular one-pixel IconFlatListOutline artwork. */
const IconFlatListOutlineRegular = (props) => jsx(IconFlatListOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconFlatListOutline artwork with a 1.3px stroke. */
const IconFlatListOutlineMedium = (props) => jsx(IconFlatListOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconWorkspaceTreeOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	stroke: "currentColor",
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", { d: "M14 12.05c0 .8-.65 1.45-1.46 1.45H3.46C2.65 13.5 2 12.85 2 12.05v-8.1c0-.8.65-1.45 1.46-1.45h2.4c.49 0 .94.24 1.21.65l.5.73c.27.4.73.65 1.21.65h3.76c.8 0 1.46.65 1.46 1.45v6.02Z" }), jsx("path", { d: "M8.7 8.1v3M11.2 8.1v3" })]
});
/** Regular one-pixel IconWorkspaceTreeOutline artwork. */
const IconWorkspaceTreeOutlineRegular = (props) => jsx(IconWorkspaceTreeOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconWorkspaceTreeOutline artwork with a 1.3px stroke. */
const IconWorkspaceTreeOutlineMedium = (props) => jsx(IconWorkspaceTreeOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconChevronsUpDownOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	stroke: "currentColor",
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", { d: "m5.1 6 2.9-2.9L10.9 6" }), jsx("path", { d: "m5.1 10 2.9 2.9 2.9-2.9" })]
});
/** Regular one-pixel IconChevronsUpDownOutline artwork. */
const IconChevronsUpDownOutlineRegular = (props) => jsx(IconChevronsUpDownOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconChevronsUpDownOutline artwork with a 1.3px stroke. */
const IconChevronsUpDownOutlineMedium = (props) => jsx(IconChevronsUpDownOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconArchiveOffOutlineArtwork = ({ size = 16, className, strokeWidth }) => {
	const maskId = `dsh-archive-off-${useId().replaceAll(":", "")}`;
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 16 16",
		fill: "none",
		stroke: "currentColor",
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		strokeWidth,
		children: [
			jsxs("mask", {
				id: maskId,
				maskUnits: "userSpaceOnUse",
				x: "0",
				y: "0",
				width: "16",
				height: "16",
				children: [jsx("rect", {
					x: "0",
					y: "0",
					width: "16",
					height: "16",
					fill: "white",
					stroke: "none"
				}), jsx("path", {
					d: "m2.2 1.3 11.6 12.8",
					stroke: "black",
					strokeWidth: strokeWidth + 3
				})]
			}),
			jsxs("g", {
				mask: `url(#${maskId})`,
				children: [jsx("rect", {
					x: "1.9",
					y: "2.1",
					width: "12.2",
					height: "3.4",
					rx: "1.1"
				}), jsx("path", { d: "M2.95 5.7v4.8a2.9 2.9 0 0 0 2.9 2.9h4.3a2.9 2.9 0 0 0 2.9-2.9V5.7" })]
			}),
			jsx("path", { d: "m2.2 1.3 11.6 12.8" })
		]
	});
};
/** Regular one-pixel IconArchiveOffOutline artwork. */
const IconArchiveOffOutlineRegular = (props) => jsx(IconArchiveOffOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconArchiveOffOutline artwork with a 1.3px stroke. */
const IconArchiveOffOutlineMedium = (props) => jsx(IconArchiveOffOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconArchiveCheckOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	stroke: "currentColor",
	strokeLinecap: "round",
	strokeLinejoin: "round",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("rect", {
			x: "1.9",
			y: "2.1",
			width: "12.2",
			height: "3.4",
			rx: "1.1"
		}),
		jsx("path", { d: "M2.95 5.7v4.8a2.9 2.9 0 0 0 2.9 2.9h4.3a2.9 2.9 0 0 0 2.9-2.9V5.7" }),
		jsx("path", { d: "m6 9.35 1.4 1.4 2.6-2.6" })
	]
});
/** Regular one-pixel IconArchiveCheckOutline artwork. */
const IconArchiveCheckOutlineRegular = (props) => jsx(IconArchiveCheckOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconArchiveCheckOutline artwork with a 1.3px stroke. */
const IconArchiveCheckOutlineMedium = (props) => jsx(IconArchiveCheckOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconSlidersTwoOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	stroke: "currentColor",
	strokeLinecap: "round",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", { d: "M2.3 5h5.85M12.05 5h1.65" }),
		jsx("circle", {
			cx: "9.95",
			cy: "5",
			r: "1.45"
		}),
		jsx("path", { d: "M2.3 11h1.65M7.85 11h5.85" }),
		jsx("circle", {
			cx: "5.75",
			cy: "11",
			r: "1.45"
		})
	]
});
/** Regular one-pixel IconSlidersTwoOutline artwork. */
const IconSlidersTwoOutlineRegular = (props) => jsx(IconSlidersTwoOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Medium IconSlidersTwoOutline artwork with a 1.3px stroke. */
const IconSlidersTwoOutlineMedium = (props) => jsx(IconSlidersTwoOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
const IconMicrophoneOutlineArtwork = ({ size = 16, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	viewBox: "0 0 16 16",
	className,
	fill: "none",
	stroke: "currentColor",
	strokeWidth,
	"aria-hidden": "true",
	children: [jsx("rect", {
		x: 4.5 + strokeWidth / 2,
		y: 1 + strokeWidth / 2,
		width: 7 - strokeWidth,
		height: 10 - strokeWidth,
		rx: (7 - strokeWidth) / 2
	}), jsx("path", { d: "M2.35 8.675C3.075 11.3 5.2 13.125 8 13.125C10.8 13.125 12.925 11.3 13.65 8.675M8 13.125V15" })]
});
/** Microphone with uniform one-pixel strokes. */
const IconMicrophoneOutlineRegular = (props) => jsx(IconMicrophoneOutlineArtwork, {
	...props,
	strokeWidth: 1
});
/** Microphone with uniform 1.3px strokes. */
const IconMicrophoneOutlineMedium = (props) => jsx(IconMicrophoneOutlineArtwork, {
	...props,
	strokeWidth: ICON_MEDIUM_STROKE
});
//#endregion
//#region lib/types/StateDot.js
/**
* Pin the loader's CSS animations to document time zero. A CSS animation starts
* when its element is inserted, so loaders mounted at different moments rotate
* out of phase; one shared start time keeps every visible loader in step.
* @param element - the mounted loader, or null on unmount.
*/
function syncSpinner(element) {
	if (element === null) return;
	const spinner = element;
	for (const animation of spinner.getAnimations?.({ subtree: true }) ?? []) animation.startTime = 0;
}
/**
* Render a state dot.
* @param props.state - which of `done`, `warning`, `ongoing`, `error`, or `idle` to show.
* @param props.size - outer diameter in px; defaults to 14 for ongoing and 10 for solid states.
* @param props.className - extra class for layout placement.
* @param props.appearance - compact dot by default; step uses a filled check or hollow pending circle.
* @returns the dot element (aria-hidden; pair with text for accessibility).
*/
function StateDot({ state, size, className, appearance = "dot" }) {
	const edge = size ?? (state === "ongoing" ? 14 : 10);
	if (state === "ongoing") return jsx("svg", {
		ref: syncSpinner,
		className: clsx(css.spinner, className),
		"data-state": "ongoing",
		width: edge,
		height: edge,
		viewBox: "0 0 24 24",
		"aria-hidden": "true",
		children: jsxs("g", {
			className: css.spinnerMotion,
			children: [jsx("circle", {
				className: css.spinnerTrack,
				cx: "12",
				cy: "12",
				r: "9.5"
			}), jsx("circle", {
				className: css.spinnerArc,
				cx: "12",
				cy: "12",
				r: "9.5"
			})]
		})
	});
	return jsx("span", {
		className: clsx(appearance === "step" ? css.step : css.dot, className),
		"data-state": state,
		style: {
			width: edge,
			height: edge
		},
		"aria-hidden": "true",
		children: appearance === "step" && state === "done" && jsx(IconCheckOutlineRegular, { size: edge - 2 })
	});
}
//#endregion
//#region lib/types/TextShimmer.js
/** Text activity animation shared by a row and its nested text fragments. */
const DecorativeCopy = createContext(void 0);
function TextContent({ children, className }) {
	const generated = useContext(DecorativeCopy) === true && typeof children === "string";
	return jsx("span", {
		className: clsx(css$1.text, className),
		"data-shimmer-text": generated ? children : void 0,
		children: generated ? null : children
	});
}
/**
* Render text with one shared highlight while retaining selectable, accessible content.
* Nested instances inherit the outer animation. Keep icons outside; mark decorative
* separators with data-shimmer-decoration so their background follows the highlight.
* Active children also render in an inert, clipped decoration; supply only presentation.
* @param props - localized text, running state, and owner styling.
* @returns retained text and its optional decorative highlight.
*/
const TextShimmer = memo(function TextShimmer({ children, active = false, className, contentClassName }) {
	if (useContext(DecorativeCopy) !== void 0) return jsx(TextContent, {
		className,
		children
	});
	const content = typeof children === "string" ? jsx(TextContent, { children }) : children;
	return jsxs("span", {
		className: clsx(css$1.root, className),
		"data-shimmer": active || void 0,
		children: [jsx(DecorativeCopy.Provider, {
			value: false,
			children: jsx("span", {
				className: clsx(css$1.content, contentClassName),
				children: content
			})
		}), active && jsx("span", {
			className: css$1.decoration,
			"aria-hidden": "true",
			inert: "",
			children: jsx("span", {
				className: css$1.sweep,
				children: jsx(DecorativeCopy.Provider, {
					value: true,
					children: jsx("span", {
						className: clsx(css$1.content, css$1.highlight, contentClassName),
						children: content
					})
				})
			})
		})]
	});
});
//#endregion
//#region lib/types/DisclosureRow.js
/**
* Render one disclosure header and its controlled expanded content.
* Shallow prop comparison requires stable callbacks and React nodes to skip unchanged renders.
* @param props - Visual content, controlled state, and interaction policy.
* @returns the disclosure row.
*/
const DisclosureRow = memo(function DisclosureRow({ icon, title, open, expandable, onToggle, running = false, expandOnRowClick = false, previewChevron = expandable, keepContentWhenOpen = false, collapsedContent, children, className, rowClassName, contentClassName, contentLayoutClassName, leadingClassName, chevronClassName, titleClassName }) {
	const rowExpands = expandable && expandOnRowClick;
	const toggleFromLeading = (event) => {
		event.stopPropagation();
		onToggle();
	};
	const toggleFromKeyboard = (event) => {
		if (!rowExpands || event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		onToggle();
	};
	const collapsedLeading = previewChevron ? jsxs(Fragment, { children: [jsx("span", {
		className: css$2.iconIdle,
		children: icon
	}), jsx(IconChevronDownOutlineRegular, { className: clsx(chevronClassName, css$2.chevronHover) })] }) : icon;
	const leading = open ? jsx(IconChevronUpOutlineRegular, { className: chevronClassName }) : collapsedLeading;
	return jsxs("div", {
		className: clsx(css$2.root, className),
		"data-open": open || void 0,
		children: [jsxs("div", {
			className: clsx(css$2.row, rowClassName),
			"data-disclosure-row": true,
			"data-expandable": rowExpands || void 0,
			role: rowExpands ? "button" : void 0,
			tabIndex: rowExpands ? 0 : void 0,
			"aria-expanded": rowExpands ? open : void 0,
			onClick: rowExpands ? onToggle : void 0,
			onKeyDown: rowExpands ? toggleFromKeyboard : void 0,
			children: [expandable && !rowExpands ? jsx("button", {
				type: "button",
				className: clsx(css$2.leading, leadingClassName),
				"aria-label": title,
				"aria-expanded": open,
				onClick: toggleFromLeading,
				children: leading
			}) : jsx("span", {
				className: clsx(css$2.leading, leadingClassName),
				children: leading
			}), jsxs(TextShimmer, {
				active: running,
				className: contentClassName,
				contentClassName: contentLayoutClassName,
				children: [jsx(TextShimmer, {
					className: clsx(css$2.title, titleClassName),
					children: title
				}), (keepContentWhenOpen || !open) && collapsedContent]
			})]
		}), open && children]
	});
});
//#endregion
//#region lib/types/Button.js
/**
* Render a button.
* @param props.variant - visual family (default 'ghost').
* @param props.size - 'md' 36px control with 12px corners or 'sm' 28px control with 8px corners.
* @param props.icon - optional leading 16px icon node.
* @param ref - native button for focus management and overlay anchors.
* @returns the button element; native button attributes pass through.
*/
const Button = forwardRef(function Button({ variant = "ghost", size = "md", icon, className, children, ...rest }, ref) {
	return jsxs("button", {
		ref,
		type: "button",
		className: clsx(css$3.button, css$3[variant], css$3[size], className),
		...rest,
		children: [icon != null && jsx("span", {
			className: css$3.icon,
			children: icon
		}), children]
	});
});
//#endregion
//#region lib/types/Pill.js
/**
* Render a pill chip. Interactive when onClick is supplied (renders a button);
* otherwise a static span.
* @param props.active - selected/active visual state.
* @returns pill element.
*/
function Pill({ active = false, className, children, onClick, ...rest }) {
	if (!onClick) return jsx("span", {
		className: clsx(css$4.pill, active && css$4.active, className),
		children
	});
	return jsx("button", {
		type: "button",
		className: clsx(css$4.pill, css$4.interactive, active && css$4.active, className),
		onClick,
		...rest,
		children
	});
}
//#endregion
//#region lib/types/SegmentedTabs.js
/**
* Render equal-width, controlled tabs with a sliding selection indicator.
* @param props.items - non-empty ordered tabs with unique values and DOM ids.
* @param props.value - selected value, which must belong to items.
* @param props.onChange - selection requested by click, Left/Right, or Home/End.
* Keyboard selection also moves focus; only the selected tab is a tab stop.
* @param props.label - localized accessible name for the tab list.
* @param props.className - layout placement; panels remain caller-owned.
* @returns the tab list, without its panels.
*/
function SegmentedTabs({ items, value, onChange, label, className }) {
	const selectedIndex = items.findIndex((item) => item.value === value);
	const onKeyDown = (event, index) => {
		let next;
		switch (event.key) {
			case "ArrowLeft":
				next = (index + items.length - 1) % items.length;
				break;
			case "ArrowRight":
				next = (index + 1) % items.length;
				break;
			case "Home":
				next = 0;
				break;
			case "End":
				next = items.length - 1;
				break;
			default: return;
		}
		event.preventDefault();
		event.stopPropagation();
		const tablist = event.currentTarget.parentElement;
		const nextItem = items[next];
		/* v8 ignore next -- the event comes from a mounted direct child and next is bounded by non-empty items. */
		if (tablist === null || nextItem === void 0) return;
		tablist.querySelectorAll("[role=\"tab\"]").item(next).focus();
		onChange(nextItem.value);
	};
	return jsxs("div", {
		role: "tablist",
		"aria-label": label,
		className: clsx(css$5.tabs, className),
		style: { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` },
		children: [jsx("span", {
			className: css$5.indicator,
			"aria-hidden": "true",
			style: {
				width: `calc((100% - 8px) / ${items.length})`,
				transform: `translateX(${selectedIndex * 100}%)`
			}
		}), items.map((item, index) => jsx(Pill, {
			id: item.id,
			role: "tab",
			className: css$5.tab,
			"aria-selected": value === item.value,
			"aria-controls": item.panelId,
			tabIndex: value === item.value ? 0 : -1,
			onClick: () => {
				onChange(item.value);
			},
			onKeyDown: (event) => {
				onKeyDown(event, index);
			},
			children: item.label
		}, item.value))]
	});
}
//#endregion
//#region lib/types/Tag.js
/**
* Render a read-only tag.
* @param props.tone - which palette to use (default `outline`).
* @param props.className - extra class for layout placement.
* @param props.children - the localized label, owned by the render site.
* @returns the tag element.
*/
function Tag({ tone = "outline", className, children }) {
	return jsx("span", {
		className: clsx(css$6.tag, className),
		"data-tone": tone,
		children
	});
}
//#endregion
//#region lib/types/PathLabel.js
/** A single-line file path whose trailing characters remain visible in narrow toolbars. */
/**
* Render subdued directories and a primary filename, with the complete path on hover.
* Fitting text is left-aligned; overflow clips and fades at the left edge.
* The fade updates on path changes and, when ResizeObserver is available, size changes.
* @param props - File path and attributes for its outer span; callers own toolbar spacing.
* @returns the path label.
*/
function PathLabel({ path, className, ...attributes }) {
	const boxRef = useRef(null);
	const textRef = useRef(null);
	const { directory, name } = pathPartsOf(path);
	useLayoutEffect(() => {
		const outer = boxRef.current;
		const inner = textRef.current;
		const apply = () => {
			outer.toggleAttribute("data-path-clipped", inner.offsetWidth > outer.clientWidth);
		};
		apply();
		const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(apply);
		observer?.observe(outer);
		observer?.observe(inner);
		return () => {
			observer?.disconnect();
		};
	}, [path]);
	return jsx("span", {
		...attributes,
		ref: boxRef,
		className: clsx(css$7.path, className),
		title: path,
		"data-path-label": true,
		children: jsxs("span", {
			ref: textRef,
			className: css$7.text,
			children: [directory !== "" && jsx("span", {
				className: css$7.directory,
				children: directory
			}), jsx("span", {
				className: css$7.name,
				children: name
			})]
		})
	});
}
//#endregion
//#region lib/types/Switch.js
/**
* Render a toggle switch.
* @param props.checked - the current state; the control is fully controlled.
* @param props.onChange - called with the state the click asks for.
* @param props.label - localized accessible name, owned by the render site.
* @param props.disabled - whether the control refuses input; owners also set it
* while a write is in flight, not only when a deployment locks the toggle.
* @param props.title - localized hover text, typically why the toggle is locked.
* @param props.className - extra class for layout placement.
* @returns the switch element.
*/
function Switch({ checked, onChange, label, disabled = false, title, className }) {
	return jsx("button", {
		type: "button",
		role: "switch",
		"aria-checked": checked,
		"aria-label": label,
		title,
		disabled,
		className: clsx(css$8.switch, className),
		onClick: () => {
			onChange(!checked);
		},
		children: jsx("span", { className: css$8.thumb })
	});
}
//#endregion
//#region lib/types/SegmentedControl.js
function isWalkKey(key) {
	return key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End";
}
/**
* The enabled option a walk key lands on from the selected one: arrows step
* to the nearest enabled neighbour and wrap, Home and End jump to the first
* and last enabled option.
*/
function walk(options, from, key) {
	const enabled = options.filter((option) => option.disabled !== true);
	if (key === "Home") return enabled[0];
	if (key === "End") return enabled[enabled.length - 1];
	const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : -1;
	const count = options.length;
	for (let offset = 1; offset < count; offset += 1) {
		const candidate = options[((from + step * offset) % count + count) % count];
		if (candidate !== void 0 && candidate.disabled !== true) return candidate;
	}
}
/**
* Render a segmented control.
* @param props.id - the owner's base id: each tab is `<id>-<value>` and names
* `<id>-<value>-panel` as the panel it controls.
* @param props.value - the selected option's value; the control is fully controlled.
* @param props.options - the segments in display order; at least two.
* @param props.onChange - called with the value a click or a walk key asks for,
* never with the value already selected.
* @param props.label - localized accessible name of the tablist.
* @param props.disabled - lock every segment, typically while the shown panel
* has a write or a fetch in flight that switching would orphan.
* @param props.className - extra class for layout placement.
* @returns the tablist element.
*/
function SegmentedControl({ id, value, options, onChange, label, disabled = false, className }) {
	const list = useRef(null);
	const selected = options.findIndex((option) => option.value === value);
	useEffect(() => {
		const root = list.current;
		/* v8 ignore next -- the ref is attached to the always-rendered root before any effect runs. */
		if (root === null) return;
		if (!root.contains(document.activeElement)) return;
		root.querySelector("[role=\"tab\"][aria-selected=\"true\"]")?.focus();
	}, [value]);
	const onKeyDown = (event) => {
		if (!isWalkKey(event.key)) return;
		event.preventDefault();
		const target = walk(options, selected, event.key);
		if (target !== void 0 && target.value !== value) onChange(target.value);
	};
	const indicator = {
		"--dsh-segment-count": String(options.length),
		"--dsh-segment-index": String(selected)
	};
	return jsxs("div", {
		ref: list,
		role: "tablist",
		"aria-label": label,
		className: clsx(css$9.control, className),
		style: indicator,
		children: [jsx("span", {
			"aria-hidden": "true",
			className: css$9.indicator
		}), options.map((option) => {
			const active = option.value === value;
			return jsx("button", {
				id: `${id}-${option.value}`,
				type: "button",
				role: "tab",
				"aria-selected": active,
				"aria-controls": `${id}-${option.value}-panel`,
				tabIndex: active ? 0 : -1,
				disabled: disabled || option.disabled === true,
				title: option.title,
				className: css$9.tab,
				onClick: () => {
					if (!active) onChange(option.value);
				},
				onKeyDown,
				children: option.label
			}, option.value);
		})]
	});
}
//#endregion
//#region lib/types/Checkbox.js
/** Controlled native checkbox with a caller-owned visible and accessible label. */
/**
* Render a labeled checkbox with native keyboard and form semantics.
* @param props.checked - current checked state.
* @param props.onChange - receives the requested checked state.
* @param props.label - localized visible and accessible label.
* @param props.disabled - whether the control refuses changes.
* @param props.title - optional localized hover text.
* @param props.className - extra class for the label's placement.
* @returns the label containing its checkbox.
*/
function Checkbox({ checked, onChange, label, disabled = false, title, className }) {
	return jsxs("label", {
		className: clsx(css$10.checkbox, className),
		title,
		children: [jsx("input", {
			type: "checkbox",
			checked,
			disabled,
			onChange: (event) => {
				onChange(event.target.checked);
			}
		}), jsx("span", { children: label })]
	});
}
//#endregion
//#region lib/types/Input.js
/**
* Render a text input with an optional leading icon.
* @param props.icon - optional 16px leading icon node.
* @param ref - the native input, cleared when it unmounts.
* @returns wrapper span containing the native input; input attributes pass through.
*/
const Input = forwardRef(function Input({ icon, className, ...rest }, ref) {
	return jsxs("span", {
		className: clsx(css$11.wrap, className),
		children: [icon != null && jsx("span", {
			className: css$11.icon,
			children: icon
		}), jsx("input", {
			ref,
			className: css$11.input,
			...rest
		})]
	});
});
//#endregion
//#region lib/types/overlay-top-margin.js
/** Shared viewport inset for overlays, derived from the desktop frame's reserved top strip. */
/**
* Resolve the top margin an overlay keeps from the viewport edge.
* @param min - the overlay's own viewport margin in px, used as the floor.
* @returns the larger of `min` and the frame clearance plus 20px; fullscreen keeps only the 20px gap.
*/
function overlayTopMargin(min) {
	const root = document.documentElement;
	const clearance = Number.parseFloat(getComputedStyle(root).getPropertyValue("--dsh-frame-top-clearance"));
	if (Number.isNaN(clearance)) return min;
	return Math.max(min, (root.hasAttribute("data-fullscreen") ? 0 : clearance) + 20);
}
/**
* Delay a pointer-dismissed popup's close so the pointer can cross the gap
* between anchor and popup. A pending close is dropped on unmount.
* @param close - runs when the grace elapses with no re-entry; read at fire
* time, so callers may pass a fresh closure each render.
* @returns the {@link PointerGrace} handle.
*/
function usePointerGrace(close) {
	const timerRef = useRef(null);
	const closeRef = useRef(close);
	closeRef.current = close;
	const cancel = useCallback(() => {
		if (timerRef.current === null) return;
		clearTimeout(timerRef.current);
		timerRef.current = null;
	}, []);
	const arm = useCallback(() => {
		cancel();
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			closeRef.current();
		}, 200);
	}, [cancel]);
	useEffect(() => cancel, [cancel]);
	return {
		arm,
		cancel
	};
}
//#endregion
//#region lib/types/keyboard-composition.js
/** Composition lifetime for local keyboard handlers, including a late closing keydown. */
/**
* Observe composition until its closing key is released or consumed.
* @param document - document whose input events belong to the caller.
* @returns an event guard and a disposer for all listeners.
*/
function observeComposition(document) {
	let composing = false;
	let ended = false;
	const start = () => {
		composing = true;
	};
	const end = () => {
		composing = false;
		ended = true;
	};
	const release = () => {
		ended = false;
	};
	const blur = () => {
		composing = false;
		ended = false;
	};
	document.addEventListener("compositionstart", start, true);
	document.addEventListener("compositionend", end, true);
	document.addEventListener("keyup", release, true);
	document.defaultView?.addEventListener("blur", blur);
	return {
		guards: (event) => {
			const guarded = composing || ended || event.isComposing || event.keyCode === 229;
			ended = false;
			return guarded;
		},
		dispose: () => {
			document.removeEventListener("compositionstart", start, true);
			document.removeEventListener("compositionend", end, true);
			document.removeEventListener("keyup", release, true);
			document.defaultView?.removeEventListener("blur", blur);
		}
	};
}
//#endregion
//#region lib/types/focus.js
/** Focus presentation for automatic entry and restoration. */
const releases = /* @__PURE__ */ new WeakMap();
const navigationKeys = new Set([
	"Tab",
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End"
]);
/**
* Focus an automatic destination without a focus outline until keyboard navigation or blur.
* The theme suppresses outlines while data-dsh-automatic-focus is present; borders and shadows remain intact.
* Tab and directional navigation restore normal focus styling.
* @param element - control or container receiving automatic focus.
* @param options - browser focus options, including scroll preservation.
*/
function focusWithoutRing(element, options) {
	releases.get(element)?.();
	const release = () => {
		element.removeAttribute("data-dsh-automatic-focus");
		element.removeEventListener("blur", release);
		element.removeEventListener("keydown", navigate, true);
		releases.delete(element);
	};
	const navigate = (event) => {
		if (!event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey && navigationKeys.has(event.key)) release();
	};
	releases.set(element, release);
	element.setAttribute("data-dsh-automatic-focus", "");
	element.addEventListener("blur", release);
	element.addEventListener("keydown", navigate, true);
	element.focus(options);
	if (!element.matches(":focus")) release();
}
//#endregion
//#region lib/types/useModalLayer.js
/** Shared modal keyboard ownership and focus lifetime. */
/** Dialog and menu elements whose document order determines foreground shortcut ownership. */
const modalSelector = "[role=\"dialog\"][aria-modal=\"true\"], [role=\"menu\"]";
const layers = /* @__PURE__ */ new WeakMap();
/**
* Request closure of the foreground registered modal using its current onClose callback.
* A newer menu or unregistered dialog blocks dismissal of the modal behind it.
* @param document - product document whose modal owns the close command.
*/
function closeTopModal(document) {
	const top = layers.get(document)?.at(-1);
	if (top === void 0) return;
	if ([...document.querySelectorAll("[role=\"dialog\"][aria-modal=\"true\"], [role=\"menu\"]")].at(-1) === top.element) top.close();
}
/**
* Whether an anchor belongs behind the current modal and must yield keyboard input.
* @param anchor - local control owning the input handler.
* @returns true when another modal owns the foreground.
*/
function isBehindModal(anchor) {
	if (anchor === null) return false;
	const top = layers.get(anchor.ownerDocument)?.at(-1);
	return top !== void 0 && !top.element.contains(anchor);
}
const focusable = "button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex=\"0\"]";
/**
* Give only the top modal Escape and Tab ownership, then restore its previous focus.
* Automatic entry and return focus omit outlines; keyboard traversal retains its indicators.
* Controls mounted with the dialog use data-modal-autofocus for initial focus;
* React autoFocus runs before this layer can capture the invoking control.
* Local menus handle their Escape during capture before this bubble listener.
* @param dialog - mounted dialog element.
* @param open - whether this layer is active.
* @param onClose - top-layer Escape or application close action.
*/
function useModalLayer(dialog, open, onClose) {
	const close = useRef(onClose);
	close.current = onClose;
	useLayoutEffect(() => {
		const element = dialog.current;
		if (!open || element === null) return;
		const document = element.ownerDocument;
		const composition = observeComposition(document);
		const previous = document.activeElement;
		const stack = layers.get(document) ?? [];
		layers.set(document, stack);
		const layer = {
			element,
			close: () => {
				close.current();
			}
		};
		stack.push(layer);
		const initial = element.querySelector("[data-modal-autofocus]") ?? element.querySelector(focusable) ?? element;
		if (!element.contains(document.activeElement)) focusWithoutRing(initial);
		const keydown = (event) => {
			const composing = composition.guards(event);
			if (stack.at(-1) !== layer || event.defaultPrevented || composing || event.ctrlKey || event.altKey || event.metaKey) return;
			if (event.key === "Escape" && !event.shiftKey) {
				event.preventDefault();
				if (!event.repeat) close.current();
			}
			if (event.key !== "Tab") return;
			if (document.activeElement?.closest("[role=\"menu\"]")) return;
			const items = [...element.querySelectorAll(focusable)].filter((item) => !item.closest("[inert], [hidden]"));
			const first = items[0] ?? element;
			const last = items.at(-1) ?? element;
			const atEdge = event.shiftKey ? document.activeElement === first : document.activeElement === last;
			if (document.activeElement === element || !element.contains(document.activeElement) || atEdge) {
				event.preventDefault();
				(event.shiftKey ? last : first).focus();
			}
		};
		document.addEventListener("keydown", keydown);
		return () => {
			composition.dispose();
			const wasTop = stack.at(-1) === layer;
			stack.splice(stack.indexOf(layer), 1);
			document.removeEventListener("keydown", keydown);
			if (stack.length === 0) layers.delete(document);
			if (wasTop) {
				const target = previous instanceof HTMLElement && previous.isConnected ? previous : stack.at(-1)?.element;
				if (target !== void 0) focusWithoutRing(target);
			}
		};
	}, [dialog, open]);
}
//#endregion
//#region lib/types/ShortcutKeys.js
/** Shared shortcut keycaps; callers supply the effective platform presentation. */
/**
* Render one command's keycaps without owning binding defaults or localized copy.
* @param props - effective key labels, presentation variant and optional interaction styling.
* @returns unboxed keys by default, or tooltip keycaps with plus-separated combinations grouped together.
*/
function ShortcutKeys({ keys, variant = "plain", className }) {
	return jsx("span", {
		className: clsx(css$12.keys, variant === "tooltip" && css$12.tooltip, variant === "tooltip" && keys.includes("+") && css$12.joined, className),
		children: keys.map((key, index) => jsx("kbd", {
			className: key === "+" ? css$12.separator : css$12.key,
			children: key
		}, index))
	});
}
//#endregion
//#region lib/types/MenuSurface.js
/** Shared menu material and the macOS backing that lets Chromium blur transparent windows. */
/**
* Paint a menu and, on macOS, an opaque backing behind the page content within its bounds.
* CSS anchors keep each backing aligned during placement, resizing, and nested-menu movement.
* @param props - Div content and placement, and compact geometry.
* @param ref - The visible menu div, excluding the non-interactive backing.
* @returns Menu content plus a backing portal removed with the menu.
*/
const MenuSurface = forwardRef(function MenuSurface({ compact = false, className, style, children, ...props }, ref) {
	const id = useId();
	const backingRef = useRef(null);
	useLayoutEffect(() => {
		document.body.appendChild(backingRef.current);
	}, []);
	const anchorStyle = { "--dsh-menu-anchor": `--dsh-menu-${id.replaceAll(":", "")}` };
	return jsxs(Fragment, { children: [jsxs("div", {
		...props,
		ref,
		"data-menu-material": "translucent",
		className: clsx(css$13.surface, compact && css$13.compact, className),
		style: {
			...style,
			...anchorStyle
		},
		children: [jsx("div", {
			"aria-hidden": "true",
			className: css$13.material
		}), children]
	}), createPortal(jsx("div", {
		ref: backingRef,
		"aria-hidden": "true",
		"data-menu-backing": "",
		className: clsx(css$13.backing, compact && css$13.compact),
		style: {
			...anchorStyle,
			visibility: style?.visibility
		}
	}), document.body)] });
});
//#endregion
//#region lib/types/Menu.js
/**
* Render one `role="menuitem"` row for a {@link Menu} whose rows are
* components rather than `items` data: the same markup and styling as a data
* row, so it joins the list's keyboard walk and post-selection focus return
* without any shared state. Closing the menu stays the owner's decision, as
* it is for data rows.
* @param props.children - visible row label.
* @param props.shortcut - effective key labels and accessible combination.
* @param props.icon - optional leading icon.
* @param props.disabled - whether the row cannot be activated.
* @param props.danger - whether to use the destructive row colors.
* @param props.separatorBefore - whether this row starts a new group (hairline above it).
* @param props.onSelect - row activation callback.
* @returns one menu-item row.
*/
function MenuItemButton({ children, shortcut, icon, disabled = false, danger = false, separatorBefore = false, onSelect }) {
	return jsxs("div", {
		className: css$14.itemWrap,
		children: [separatorBefore && jsx("div", {
			className: css$14.separator,
			role: "separator"
		}), jsxs("button", {
			type: "button",
			role: "menuitem",
			className: clsx(css$14.item, danger && css$14.danger),
			disabled,
			"aria-keyshortcuts": shortcut?.aria,
			onClick: onSelect,
			children: [
				icon !== void 0 && jsx("span", {
					className: css$14.itemIcon,
					children: icon
				}),
				jsx("span", {
					className: css$14.itemLabel,
					children
				}),
				shortcut !== void 0 && jsx("span", {
					"aria-hidden": "true",
					className: css$14.shortcut,
					children: jsx(ShortcutKeys, {
						keys: shortcut.keys,
						className: css$14.shortcutKeys
					})
				})
			]
		})]
	});
}
function isSeparator(entry) {
	return "type" in entry && entry.type === "separator";
}
function isLabel(entry) {
	return "type" in entry && entry.type === "label";
}
/** Unplaced portal list: hidden but laid out at a fixed origin so offsetWidth/offsetHeight are real. */
const MEASURE_STYLE = {
	visibility: "hidden",
	left: 0,
	top: 0
};
/**
* Render an anchored dropdown menu. While the list is open its keys mirror the
* composer's: Tab settles the focused row — from the trigger, Tab enters the
* list instead — and Escape or Shift+Tab close it and return focus to the
* anchor's first button, and selecting a row does the same — the rows unmount
* with the list. Only a keyboard on the trigger or inside the list is
* intercepted; Tab presses elsewhere on the page stay the browser's.
* @param props.autoFocus - focus the first item on open; the arrow keys walk the list either way.
* @param props.open - whether the list is showing (owner-controlled).
* @param props.anchor - the trigger element (rendered in place).
* @param props.items - selectable data rows and optional separators (default none; with no `children` either, the list is empty).
* @param props.selectedId - row shown as selected.
* @param props.selectedIds - rows shown as selected when a menu contains independent option groups.
* @param props.onSelect - data-row activation callback (not called for disabled rows or submenu parents that only open children).
* @param props.onClose - invoked on outside click, Escape, or a window blur
* that moved focus into an iframe (the only signal a pointerdown inside a
* cross-origin iframe leaves).
* @param props.align - list alignment against the anchor (default 'start').
* @param props.side - open below (`bottom`, default) or above (`top`) the anchor.
* @param props.portal - render the list into document.body, fixed-positioned
* from the anchor rect (follows movement and resizing while open). Use when an
* ancestor's overflow clipping would crop the in-place list; default false
* keeps the pure-CSS in-place behavior.
* @param props.closeOnPointerLeave - close the list once the pointer has left
* both trigger and list for the pointer grace (default false keeps it open
* until outside click/Escape/selection). The grace makes the 4px trigger->list
* gap and a brief overshoot survivable; coming back cancels the close.
* @param props.dense - reduce vertical row spacing without changing the standard typography or card width.
* @param props.compact - use reduced menu typography and spacing.
* @param props.getAnchorRect - portal mode only: supply the anchor rect
* directly (e.g. from a host-owned trigger button) instead of measuring the
* Menu's own wrapper span. Required when the wrapper isn't itself laid out at
* the trigger (render-prop anchors, effect-positioned proxies — measuring the
* wrapper there races the host's layout effects). Called on open, each animation
* frame, and scroll/resize; return null to skip placement for that frame.
* @param props.footer - rows pinned below the scrolling items area, separated
* by a hairline; they stay visible while the items above scroll.
* @param props.children - component rows rendered after `items` in the same
* list, each a `role="menuitem"` button such as {@link MenuItemButton}; they
* share the keyboard walk, the submenu exclusivity, and the post-selection
* focus return.
* @param props.selection - how a selected row is marked: a trailing check
* (`'check'`, default — figma .Menu_cell) or the hover fill held on the row
* with no check (`'fill'`, for icon-labelled rows where a trailing glyph
* crowds the cell).
* @param props.className - extra class on the anchor wrapper span.
* @param props.listClassName - extra class on the dropdown card itself; the
* only style hook that reaches a portaled list, which renders under
* document.body outside the owner's DOM subtree.
* @returns anchor wrapper with the conditional list.
*/
function Menu({ open, anchor, items = [], children, selectedId, selectedIds, onSelect, onClose, align = "start", side = "bottom", portal = false, closeOnPointerLeave = false, dense = false, compact = false, autoFocus = false, selection = "check", getAnchorRect, footer, className, listClassName }) {
	const rootRef = useRef(null);
	const listRef = useRef(null);
	/** Index the arrow walk last focused, the resume point when focus left the rows. */
	const walkIndex = useRef(null);
	/**
	* The control that had the keyboard when this menu opened — its own trigger,
	* which an anchor that wraps several controls (a split button) would not be
	* able to name by position.
	*/
	const triggerRef = useRef(null);
	const selectingWithTab = useRef(false);
	/**
	* Hand the keyboard back to the trigger that opened the menu — or, when the
	* anchor never held it, to the anchor's first button. Focus left on a removed
	* row otherwise falls to the page body, where the next Tab restarts from the
	* top of the page.
	* @param navigation - whether explicit keyboard traversal should retain its focus indicator.
	*/
	const refocusAnchor = (navigation = false) => {
		const trigger = triggerRef.current;
		const target = trigger !== null && document.contains(trigger) && !trigger.disabled ? trigger : rootRef.current?.querySelector("button:not(:disabled)");
		if (target == null) return;
		if (navigation) target.focus();
		else focusWithoutRing(target);
	};
	/**
	* Post-selection focus, for the paths where the rows unmount with the list.
	* A selection whose owner keeps the menu open is left alone, and so is an
	* owner that moved focus itself (a presented file card hands it to its
	* preview button): only a keyboard left on the closing list (or on the body
	* its removal produced) comes back to the trigger.
	*/
	const refocusAfterSelection = () => {
		const navigation = selectingWithTab.current;
		queueMicrotask(() => {
			if (openRef.current) return;
			const active = document.activeElement;
			if (active === null || active === document.body || listRef.current?.contains(active) === true) refocusAnchor(navigation);
		});
	};
	const openRef = useRef(open);
	openRef.current = open;
	const [openSubmenuId, setOpenSubmenuId] = useState(null);
	const [fixedPos, setFixedPos] = useState(null);
	const { arm: armClose, cancel: cancelClose } = usePointerGrace(onClose);
	useLayoutEffect(() => {
		if (!open || !portal) {
			setFixedPos(null);
			return;
		}
		const place = () => {
			let r;
			if (getAnchorRect !== void 0) r = getAnchorRect();
			else
 /* v8 ignore next 2 -- the ref is attached before the layout effect runs and the listeners die with it. */
			r = rootRef.current?.getBoundingClientRect() ?? null;
			if (r === null) return;
			const MARGIN = 12;
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const listEl = listRef.current;
			const lw = listEl?.offsetWidth ?? 0;
			const lh = listEl?.offsetHeight ?? 0;
			let x;
			let y;
			if (side === "right") {
				x = r.right + 4;
				y = r.top;
			} else if (align === "start") {
				x = r.left;
				y = side === "bottom" ? r.bottom + 4 : r.top - lh - 4;
			} else {
				x = r.right - lw;
				y = side === "bottom" ? r.bottom + 4 : r.top - lh - 4;
			}
			if (lw > 0) x = Math.min(Math.max(x, MARGIN), vw - lw - MARGIN);
			if (lh > 0) y = Math.min(Math.max(y, overlayTopMargin(MARGIN)), vh - lh - MARGIN);
			setFixedPos((current) => current?.left === x && current.top === y ? current : {
				left: x,
				top: y
			});
		};
		place();
		const track = () => {
			place();
			frame = requestAnimationFrame(track);
		};
		let frame = requestAnimationFrame(track);
		window.addEventListener("scroll", place, true);
		window.addEventListener("resize", place);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener("scroll", place, true);
			window.removeEventListener("resize", place);
		};
	}, [
		open,
		portal,
		align,
		side,
		getAnchorRect
	]);
	useEffect(() => {
		if (!open) {
			triggerRef.current = null;
			return;
		}
		const active = document.activeElement;
		triggerRef.current = active instanceof HTMLElement && rootRef.current?.contains(active) === true ? active : null;
	}, [open]);
	useEffect(() => {
		if (!open || !autoFocus) return;
		const first = listRef.current?.querySelector("button:not(:disabled)");
		walkIndex.current = first === void 0 || first === null ? null : 0;
		if (first != null) focusWithoutRing(first);
	}, [open, autoFocus]);
	useEffect(() => {
		if (!open) {
			setOpenSubmenuId(null);
			walkIndex.current = null;
			return;
		}
		const composition = observeComposition(document);
		const onPointerDown = (e) => {
			if (!(e.target instanceof Node)) return;
			if (rootRef.current?.contains(e.target) === true) return;
			if (listRef.current?.contains(e.target) === true) return;
			onClose();
		};
		const onKeyDown = (e) => {
			if (composition.guards(e) || isBehindModal(rootRef.current) || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
			const focused = document.activeElement;
			const insideList = listRef.current?.contains(focused) === true;
			const anchored = rootRef.current?.contains(focused) === true || insideList;
			if (e.key === "Escape" && !e.shiftKey) {
				e.preventDefault();
				if (e.repeat) return;
				onClose();
				if (anchored || autoFocus) refocusAnchor();
			}
			if (e.key === "Tab") {
				const list = listRef.current;
				if (list === null || !anchored) return;
				if (e.shiftKey) {
					e.preventDefault();
					onClose();
					refocusAnchor(true);
					return;
				}
				if (insideList) {
					if (focused instanceof Element && focused.getAttribute("role") === "menuitem") {
						e.preventDefault();
						selectingWithTab.current = true;
						try {
							focused.click();
						} finally {
							selectingWithTab.current = false;
						}
					}
					return;
				}
				const row = list.querySelector("button:not(:disabled)");
				if (row === null) return;
				e.preventDefault();
				row.focus();
				walkIndex.current = 0;
				return;
			}
			if (![
				"ArrowDown",
				"ArrowUp",
				"Home",
				"End"
			].includes(e.key)) return;
			const list = listRef.current;
			if (list === null || !anchored) return;
			const buttons = Array.from(list.querySelectorAll("button:not(:disabled)"));
			if (buttons.length === 0) return;
			const index = buttons.indexOf(focused);
			const from = index >= 0 ? index : walkIndex.current;
			const next = e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : from === null ? e.key === "ArrowDown" ? 0 : buttons.length - 1 : (from + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
			e.preventDefault();
			walkIndex.current = next;
			buttons[next]?.focus();
		};
		const onWindowBlur = () => {
			if (document.activeElement instanceof HTMLIFrameElement) onClose();
		};
		document.addEventListener("pointerdown", onPointerDown);
		const onEscape = (event) => {
			if (event.key === "Escape") onKeyDown(event);
		};
		const onOtherKey = (event) => {
			if (event.key !== "Escape") onKeyDown(event);
		};
		document.addEventListener("keydown", onOtherKey);
		document.addEventListener("keydown", onEscape, true);
		window.addEventListener("blur", onWindowBlur);
		return () => {
			composition.dispose();
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onOtherKey);
			document.removeEventListener("keydown", onEscape, true);
			window.removeEventListener("blur", onWindowBlur);
		};
	}, [
		open,
		onClose,
		autoFocus
	]);
	useEffect(() => {
		if (!open) cancelClose();
	}, [open, cancelClose]);
	const scrollable = !items.some((entry) => !isSeparator(entry) && !isLabel(entry) && entry.submenu !== void 0 && entry.submenu.length > 0);
	const renderEntry = (entry) => {
		if (isSeparator(entry)) return jsx("div", {
			className: css$14.separator,
			role: "separator"
		}, entry.id);
		if (isLabel(entry)) return jsx("div", {
			className: css$14.label,
			role: "presentation",
			children: entry.text
		}, entry.id);
		const hasSub = entry.submenu !== void 0 && entry.submenu.length > 0;
		const subOpen = hasSub && openSubmenuId === entry.id;
		const selected = entry.id === selectedId || selectedIds?.includes(entry.id) === true;
		return jsxs("div", {
			className: css$14.itemWrap,
			onMouseEnter: hasSub ? () => {
				setOpenSubmenuId(entry.id);
			} : void 0,
			onMouseLeave: () => {
				setOpenSubmenuId(null);
			},
			children: [jsxs("button", {
				type: "button",
				role: "menuitem",
				className: clsx(css$14.item, selected && (selection === "fill" ? css$14.selectedFill : css$14.selected), entry.danger === true && css$14.danger),
				disabled: entry.disabled,
				"aria-keyshortcuts": entry.shortcut?.aria,
				"aria-haspopup": hasSub ? "menu" : void 0,
				"aria-expanded": hasSub ? subOpen : void 0,
				onFocus: hasSub ? () => {
					setOpenSubmenuId(entry.id);
				} : void 0,
				onClick: () => {
					if (hasSub) {
						setOpenSubmenuId(entry.id);
						return;
					}
					onSelect?.(entry.id);
				},
				children: [
					entry.icon !== void 0 && jsx("span", {
						className: css$14.itemIcon,
						children: entry.icon
					}),
					jsx("span", {
						className: css$14.itemLabel,
						children: entry.label
					}),
					entry.shortcut !== void 0 && jsx("span", {
						"aria-hidden": "true",
						className: css$14.shortcut,
						children: jsx(ShortcutKeys, {
							keys: entry.shortcut.keys,
							className: css$14.shortcutKeys
						})
					}),
					selected && selection === "check" && jsx(IconCheckOutlineRegular, { className: css$14.check })
				]
			}), subOpen && entry.submenu !== void 0 && jsx(MenuSurface, {
				compact,
				className: clsx(css$14.submenu, compact && css$14.compactList),
				role: "menu",
				children: entry.submenu.map((sub) => jsxs("button", {
					type: "button",
					role: "menuitem",
					className: css$14.item,
					disabled: sub.disabled,
					"aria-keyshortcuts": sub.shortcut?.aria,
					onClick: () => {
						onSelect?.(sub.id);
						refocusAfterSelection();
					},
					children: [
						sub.icon !== void 0 && jsx("span", {
							className: css$14.itemIcon,
							children: sub.icon
						}),
						jsx("span", {
							className: css$14.itemLabel,
							children: sub.label
						}),
						sub.shortcut !== void 0 && jsx("span", {
							"aria-hidden": "true",
							className: css$14.shortcut,
							children: jsx(ShortcutKeys, {
								keys: sub.shortcut.keys,
								className: css$14.shortcutKeys
							})
						})
					]
				}, sub.id))
			})]
		}, entry.id);
	};
	const collapseSubmenuFrom = (e) => {
		const row = e.target instanceof Element ? e.target.closest("button[role=\"menuitem\"]") : null;
		if (row === null || row.getAttribute("aria-haspopup") === "menu") return;
		if (row.closest("[role=\"menu\"]") !== e.currentTarget) return;
		setOpenSubmenuId(null);
	};
	const list = open && jsxs(MenuSurface, {
		compact,
		ref: listRef,
		className: clsx(css$14.list, listClassName, dense && css$14.denseList, compact && css$14.compactList, scrollable && css$14.scrollable, portal && css$14.portal, side === "top" && !portal && css$14.sideTop, align === "end" && !portal && css$14.alignEnd),
		style: portal ? fixedPos ?? MEASURE_STYLE : void 0,
		role: "menu",
		onClick: (e) => {
			e.stopPropagation();
			const row = e.target instanceof Element ? e.target.closest("button[role=\"menuitem\"]") : null;
			if (row !== null && row.getAttribute("aria-haspopup") !== "menu") refocusAfterSelection();
		},
		onMouseOver: collapseSubmenuFrom,
		onFocus: collapseSubmenuFrom,
		children: [jsxs("div", {
			className: css$14.viewport,
			role: "presentation",
			children: [items.map(renderEntry), children]
		}), footer !== void 0 && footer.length > 0 && jsx("div", {
			className: css$14.footer,
			role: "presentation",
			children: footer.map(renderEntry)
		})]
	});
	return jsxs("span", {
		ref: rootRef,
		className: clsx(css$14.root, className),
		onPointerEnter: closeOnPointerLeave ? cancelClose : void 0,
		onPointerLeave: closeOnPointerLeave ? () => {
			if (open) armClose();
		} : void 0,
		children: [anchor, portal ? list !== false && createPortal(list, document.body) : list]
	});
}
//#endregion
//#region lib/types/MenuGroup.js
/** Accessible menu groups with shared sticky-heading presentation and viewport observation. */
/**
* Render a named group with an instance-owned heading id and an inaccessible position sentinel.
* @param props - Caller-localized label and optional menu rows.
* @returns A section named by its direct heading, followed by the supplied children.
*/
function MenuGroup({ label, children }) {
	const headingId = useId();
	return jsxs("section", {
		role: "group",
		"aria-labelledby": headingId,
		"data-menu-group": "",
		className: css$15.group,
		children: [
			jsx("span", {
				"aria-hidden": "true",
				"data-menu-group-start": "",
				className: css$15.start
			}),
			jsx("div", {
				id: headingId,
				"data-menu-group-heading": "",
				className: css$15.heading,
				children: label
			}),
			children
		]
	});
}
/**
* Update heading backgrounds asynchronously from native intersection and viewport-size observations.
* Headings remain transparent until observations identify a section crossing the viewport top.
* Without IntersectionObserver or ResizeObserver, CSS sticky headings remain transparent.
* Group membership is captured at setup; dispose before observing changed groups or the same viewport again.
* @param viewport - Unpadded, borderless scroll container with direct MenuGroup children.
* @returns Cleanup owning both intersection observers and the viewport resize observer; disconnects
* them, ignores queued callbacks, and clears managed data-stuck attributes. No valid groups acquires nothing.
*/
function observeStickyMenuGroups(viewport) {
	const groups = [...viewport.querySelectorAll(":scope > [data-menu-group]")].flatMap((section) => {
		const heading = section.querySelector(":scope > [data-menu-group-heading]");
		const start = section.querySelector(":scope > [data-menu-group-start]");
		return heading === null || start === null ? [] : [{
			section,
			heading,
			start,
			atTop: false,
			above: false,
			topTime: -Infinity,
			aboveTime: -Infinity
		}];
	});
	if (groups.length === 0 || typeof IntersectionObserver === "undefined" || typeof ResizeObserver === "undefined") return () => {};
	const sections = new Map(groups.map((group) => [group.section, group]));
	const starts = new Map(groups.map((group) => [group.start, group]));
	let disposed = false;
	let stripObserver;
	let viewportHeight;
	const render = (group) => {
		const stuck = group.atTop && group.above;
		if (group.heading.hasAttribute("data-stuck") !== stuck) group.heading.toggleAttribute("data-stuck", stuck);
	};
	const startObserver = new IntersectionObserver((entries) => {
		if (disposed) return;
		for (const entry of entries) {
			const group = starts.get(entry.target);
			if (!group || entry.rootBounds === null || entry.time < group.aboveTime) continue;
			group.above = entry.boundingClientRect.top < entry.rootBounds.top;
			group.aboveTime = entry.time;
			render(group);
		}
	}, {
		root: viewport,
		threshold: [0, 1]
	});
	for (const { start } of groups) startObserver.observe(start);
	const sizeObserver = new ResizeObserver((entries) => {
		if (disposed) return;
		for (const entry of entries) {
			if (entry.target !== viewport || entry.contentRect.height === viewportHeight) continue;
			viewportHeight = entry.contentRect.height;
			stripObserver?.disconnect();
			const observer = new IntersectionObserver((intersections) => {
				if (disposed || stripObserver !== observer) return;
				for (const intersection of intersections) {
					const group = sections.get(intersection.target);
					if (!group || intersection.rootBounds === null) continue;
					const top = intersection.rootBounds.top;
					if (intersection.time >= group.topTime) {
						group.atTop = intersection.isIntersecting && intersection.boundingClientRect.bottom > top;
						group.topTime = intersection.time;
					}
					if (intersection.time >= group.aboveTime) {
						group.above = intersection.boundingClientRect.top < top;
						group.aboveTime = intersection.time;
					}
					render(group);
				}
			}, {
				root: viewport,
				rootMargin: `0px 0px ${Math.min(1, viewportHeight) - viewportHeight}px 0px`,
				threshold: 0
			});
			stripObserver = observer;
			for (const { section } of groups) observer.observe(section);
		}
	});
	sizeObserver.observe(viewport);
	return () => {
		if (disposed) return;
		disposed = true;
		startObserver.disconnect();
		stripObserver?.disconnect();
		sizeObserver.disconnect();
		for (const { heading } of groups) if (heading.hasAttribute("data-stuck")) heading.removeAttribute("data-stuck");
	};
}
//#endregion
//#region lib/types/useAnchoredMaxHeight.js
/**
* Viewport-fit hook for bottom-anchored overlays (slash menu, popupSelect):
* the element's bottom edge is laid out independent of its height, so it
* grows upward and only the top edge can collide with the viewport — clamp
* the design cap to the space between that edge and the viewport top.
*/
/**
* Safe distance kept between the overlay and the viewport top edge (mirrors
* the Menu portal margin); the frame's overlay inset widens it.
*/
const MARGIN = 12;
/**
* Clamp a bottom-anchored overlay's max-height to the viewport.
* @param ref - the overlay element; a null current (overlay closed) skips measuring.
* @param cap - design max-height in px (the clamp never exceeds it).
* @param signal - re-measure trigger: pass the overlay's render state so anchor
*   moves (composer growth) re-fit; resize/scroll re-fit while mounted.
* @param margin - viewport top margin floor in px; the frame's overlay
*   inset widens it. Callers under fixed chrome (the conversation header)
*   raise it past their chrome's height.
* @returns the max-height to apply inline, in px.
*/
function useAnchoredMaxHeight(ref, cap, signal, margin = MARGIN) {
	const [maxHeight, setMaxHeight] = useState(cap);
	useLayoutEffect(() => {
		const el = ref.current;
		if (el === null) return;
		const fit = () => {
			setMaxHeight(Math.min(cap, Math.max(0, el.getBoundingClientRect().bottom - overlayTopMargin(margin))));
		};
		fit();
		window.addEventListener("resize", fit);
		window.addEventListener("scroll", fit, true);
		return () => {
			window.removeEventListener("resize", fit);
			window.removeEventListener("scroll", fit, true);
		};
	}, [
		ref,
		cap,
		signal,
		margin
	]);
	return maxHeight;
}
//#endregion
//#region lib/types/useAnchoredPosition.js
/**
* Keep a fixed-position floating element anchored to a trigger.
*
* A portaled panel is positioned from its anchor's viewport rect, which stops
* being true the moment anything scrolls or the window resizes. This owns that
* one concern: measure the anchor, offset the panel below or above it, clamp
* the result inside the viewport, and re-run on scroll (capture phase, so
* scrollers nested inside the page are caught too), on resize, and on the
* panel's own size changes while the element is open.
* @module @deepseek-ai/dsh-client-ui-primitives/useAnchoredPosition
*/
/**
* Track an anchor and return the panel's fixed coordinates.
* @param options - the open state, the two refs, the placement side and alignment, and the gap/margin distances.
* @returns `left`/`top` for the panel, or `null` before the first measurement.
*/
function useAnchoredPosition(options) {
	const { open, anchorRef, panelRef, side = "bottom", align = "start", gap, margin } = options;
	const [position, setPosition] = useState(null);
	useLayoutEffect(() => {
		if (!open) {
			setPosition(null);
			return;
		}
		const place = () => {
			/* v8 ignore start -- geometry read from real layout: jsdom reports zero
			offset sizes, so the positive-size clamp arms are exercised by browser
			scenarios rather than unit tests. */
			const rect = anchorRef.current?.getBoundingClientRect();
			if (rect === void 0) return;
			const panel = panelRef.current;
			const width = panel?.offsetWidth ?? 0;
			const height = panel?.offsetHeight ?? 0;
			let left = align === "end" ? rect.right - width : rect.left;
			let top = side === "top" ? rect.top - gap - height : rect.bottom + gap;
			if (width > 0) left = Math.min(Math.max(left, margin), window.innerWidth - width - margin);
			if (height > 0) top = Math.min(Math.max(top, overlayTopMargin(margin)), window.innerHeight - height - margin);
			/* v8 ignore stop */
			setPosition({
				left,
				top
			});
		};
		place();
		window.addEventListener("scroll", place, true);
		window.addEventListener("resize", place);
		const panel = panelRef.current;
		let observer = null;
		if (typeof ResizeObserver !== "undefined" && panel !== null) {
			observer = new ResizeObserver(place);
			observer.observe(panel);
		}
		return () => {
			observer?.disconnect();
			window.removeEventListener("scroll", place, true);
			window.removeEventListener("resize", place);
		};
	}, [
		open,
		anchorRef,
		panelRef,
		side,
		align,
		gap,
		margin
	]);
	return position;
}
//#endregion
//#region lib/types/useDismissOnOutsidePointer.js
/**
* Outside-pointer dismissal for trigger-owned popovers (jobs list, Cordis
* panel): while the surface is open, a pointerdown outside the root closes it.
*/
/**
* Close an open popover when a pointerdown lands outside its root element.
* @param root - element containing both the trigger and the open surface.
* @param open - whether the surface is showing; false detaches the listener.
* @param setOpen - state setter invoked with false on an outside pointerdown.
* @param portal - surface portaled outside the root (a `document.body` dialog)
* that also counts as inside; omit when the root contains the whole popover.
*/
function useDismissOnOutsidePointer(root, open, setOpen, portal) {
	useEffect(() => {
		if (!open) return;
		const closeOutside = (event) => {
			if (event.target instanceof Node && root.current?.contains(event.target) !== true && portal?.current?.contains(event.target) !== true) setOpen(false);
		};
		document.addEventListener("pointerdown", closeOutside);
		return () => {
			document.removeEventListener("pointerdown", closeOutside);
		};
	}, [
		root,
		open,
		setOpen,
		portal
	]);
}
//#endregion
//#region lib/types/clipboard.js
/**
* Write text to the host clipboard, preferring the async Clipboard API and
* falling back to `execCommand('copy')` on hosts (jsdom, insecure contexts)
* that omit it.
* @param text - the exact text to place on the clipboard.
* @returns true only when the host accepted the write.
*/
async function writeClipboard(text) {
	if (navigator.clipboard?.writeText) try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
	const exec = typeof document.execCommand === "function" ? document.execCommand.bind(document) : void 0;
	if (exec === void 0) return false;
	const el = document.createElement("textarea");
	el.value = text;
	el.setAttribute("readonly", "");
	el.style.position = "fixed";
	el.style.left = "-9999px";
	document.body.appendChild(el);
	el.select();
	try {
		return exec("copy");
	} catch {
		return false;
	} finally {
		el.remove();
	}
}
//#endregion
//#region lib/types/input-modality.js
/**
* Document-wide input tracking shared by tooltips and focus-ring styles.
* Tooltips follow the last input; rings follow navigation or a key followed by
* focus on a different control. Modifiers and refocusing alone keep rings silent.
* Module-level listeners live for the document lifetime; Node imports are inert.
*/
/** Modality values published on the document element. */
const INPUT_MODALITY = {
	pointer: "pointer",
	keyboard: "keyboard"
};
/** Attribute carrying whether focus navigation last owned focus. */
const INPUT_MODALITY_ATTRIBUTE = "data-input-modality";
const FOCUS_NAVIGATION = new Set([
	"Tab",
	"Home",
	"End",
	"PageUp",
	"PageDown"
]);
let pointer = false;
let pointerOwnsFocus = false;
let keyFocusOrigin;
function publish() {
	document.documentElement.setAttribute(INPUT_MODALITY_ATTRIBUTE, pointerOwnsFocus ? INPUT_MODALITY.pointer : INPUT_MODALITY.keyboard);
}
/**
* Whether the last input came from a pointer, independently of ring visibility.
* @returns True after pointer input; false after any key.
*/
function pointerModality() {
	return pointer;
}
if (typeof window !== "undefined") {
	window.addEventListener("pointerdown", () => {
		pointer = true;
		pointerOwnsFocus = true;
		keyFocusOrigin = void 0;
		publish();
	}, true);
	window.addEventListener("keydown", (event) => {
		pointer = false;
		if (event.isComposing) {
			keyFocusOrigin = void 0;
			return;
		}
		keyFocusOrigin = event.composedPath()[0];
		if (!FOCUS_NAVIGATION.has(event.key) && !event.key.startsWith("Arrow")) return;
		pointerOwnsFocus = false;
		publish();
	}, true);
	window.addEventListener("focusin", (event) => {
		if (keyFocusOrigin === void 0 || event.composedPath()[0] === keyFocusOrigin) return;
		keyFocusOrigin = void 0;
		if (!pointerOwnsFocus) return;
		pointerOwnsFocus = false;
		publish();
	}, true);
	window.addEventListener("blur", () => {
		keyFocusOrigin = void 0;
	});
}
//#endregion
//#region lib/types/Tooltip.js
/** Anchor-preserving tooltips; an optional body portal escapes clipping containers and stacking contexts that cap the bubble's z-index. */
/**
* Suppression channel for enclosing tooltip and hover-card anchors: a visible
* tooltip within an anchor withdraws the enclosing preview while its bubble is shown.
*/
const TooltipSuppression = createContext(null);
/**
* Attach a hover/focus tooltip to an anchor element.
* @param props.label - bubble text, or a resolver evaluated only while visible; an empty string shows only shortcut keys.
* @param props.shortcutKeys - effective key labels rendered as platform-formatted keycaps after optional text.
* @param props.side - placement relative to the anchor (default 'right').
* @param props.align - horizontal anchor-edge alignment for 'bottom'/'top' bubbles: 'end' pins
* the bubble's right edge to the anchor's (for anchors beside other hover surfaces the centered
* bubble would overlap); default 'center'. Ignored for side 'right'.
* @param props.portal - render the bubble under document.body, so an ancestor's clipping or its
* stacking context (which confines the bubble's z-index to that context) cannot hide it.
* @param props.delayMs - hover delay in milliseconds (default 0).
* @param props.focusDelayMs - keyboard focus delay in milliseconds (default 0); blur, click,
* mouse leave, disabling, and unmount cancel a pending show.
* @param props.gap - anchor-to-bubble distance in pixels for 'bottom'/'top' bubbles (default 8);
* ignored for side 'right'.
* @param props.disabled - suppress the bubble while true; the anchor renders identically so
* toggling never remounts it (which would cut its CSS transitions).
* @param props.maxWidth - bubble width cap in pixels, for labels long enough that the default
* half-viewport cap would render a slab wider than the surface the anchor sits on.
* @param props.openOnClick - clicking also pins the bubble for reading; another click, Escape,
* Tab, or an outside pointerdown dismisses it. Defaults to false for ordinary action tooltips.
* @param props.children - a single anchor element; its own ref (callback or object) is forwarded alongside the tooltip's.
* @returns the cloned anchor plus a fixed-position bubble, optionally portaled to the body.
* The bubble stays hidden until ResizeObserver supplies its size for viewport fitting; clicking the
* anchor dismisses the bubble unless openOnClick is enabled, and focus arriving after a pointer
* interaction (a closing menu refocusing its trigger) never raises it.
*/
function Tooltip({ label, shortcutKeys, side = "right", align = "center", delayMs = 0, focusDelayMs = 0, gap = 8, disabled = false, portal = false, maxWidth, openOnClick = false, children }) {
	const id = useId();
	const [pinned, setPinned] = useState(false);
	const anchor = useRef(null);
	const childRef = children.ref;
	const mergedRef = useCallback((el) => {
		anchor.current = el;
		if (typeof childRef === "function") childRef(el);
		else if (childRef != null) childRef.current = el;
	}, [childRef]);
	const [pos, setPos] = useState(null);
	const bubble = useRef(null);
	const resolvedLabel = pos === null ? null : typeof label === "function" ? label() : label;
	const y = pos === null ? 0 : side === "right" ? pos.top + (pos.bottom - pos.top) / 2 : side === "top" ? pos.top - gap : pos.bottom + gap;
	const showTimer = useRef(null);
	const triggers = useRef({
		hover: false,
		focus: false
	});
	const suppressAncestors = useContext(TooltipSuppression);
	const [suppressed, setSuppressed] = useState(false);
	const announce = useCallback((active) => {
		suppressAncestors?.(active);
	}, [suppressAncestors]);
	const visible = pos !== null && !disabled;
	useEffect(() => {
		const el = bubble.current;
		if (pos === null || !visible || suppressed || el === null) return;
		const edgeMargin = 12;
		let size;
		let placement = side;
		const fit = () => {
			if (size === void 0) return;
			const { inlineSize: width, blockSize: height } = size;
			const offset = side === "right" ? 0 : align === "end" ? width : width / 2;
			const left = Math.max(edgeMargin, Math.min(pos.x - offset, window.innerWidth - edgeMargin - width));
			const fitsBelow = pos.bottom + gap + height <= window.innerHeight - edgeMargin;
			const fitsAbove = pos.top - gap - height >= edgeMargin;
			if (placement === "bottom" && !fitsBelow && fitsAbove) placement = "top";
			else if (placement === "top" && !fitsAbove && fitsBelow) placement = "bottom";
			el.style.left = `${left + offset}px`;
			el.style.top = `${placement === "right" ? (pos.top + pos.bottom) / 2 : placement === "top" ? pos.top - gap : pos.bottom + gap}px`;
			el.dataset.side = placement;
			el.style.visibility = "visible";
		};
		const observer = new ResizeObserver((entries) => {
			size = entries[0]?.borderBoxSize[0];
			fit();
		});
		observer.observe(el, { box: "border-box" });
		window.addEventListener("resize", fit);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", fit);
		};
	}, [
		align,
		gap,
		pos,
		side,
		suppressed,
		visible
	]);
	useEffect(() => {
		announce(visible);
		return () => {
			announce(false);
		};
	}, [announce, visible]);
	const cancelShow = useCallback(() => {
		if (showTimer.current === null) return;
		clearTimeout(showTimer.current);
		showTimer.current = null;
	}, []);
	useEffect(() => {
		if (pinned && (disabled || !openOnClick)) setPinned(false);
		if (disabled) {
			cancelShow();
			triggers.current = {
				hover: false,
				focus: false
			};
			setPos(null);
		}
		return cancelShow;
	}, [
		cancelShow,
		disabled,
		openOnClick,
		pinned
	]);
	const show = () => {
		if (disabled) return;
		const el = anchor.current;
		/* v8 ignore next -- the ref is attached by event time: events fire on the cloned anchor. */
		if (el === null) return;
		const r = el.getBoundingClientRect();
		setPos({
			x: side === "right" ? r.right + 10 : align === "end" ? r.right : r.left + r.width / 2,
			top: r.top,
			bottom: r.bottom
		});
		announce(true);
	};
	const showAfterDelay = (delay) => {
		cancelShow();
		if (delay <= 0) {
			show();
			return;
		}
		showTimer.current = setTimeout(() => {
			showTimer.current = null;
			show();
		}, delay);
	};
	const withdraw = useCallback(() => {
		setPinned(false);
		setPos(null);
		announce(false);
	}, [announce]);
	const hide = () => {
		cancelShow();
		if (!triggers.current.hover && !triggers.current.focus && !pinned) withdraw();
	};
	const dismiss = useCallback(() => {
		cancelShow();
		triggers.current = {
			hover: false,
			focus: false
		};
		withdraw();
	}, [cancelShow, withdraw]);
	useDismissOnOutsidePointer(anchor, openOnClick && visible, dismiss, bubble);
	useEffect(() => {
		if (!openOnClick || !visible) return;
		const onKeyDown = (event) => {
			if (event.key !== "Escape" && event.key !== "Tab") return;
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
			}
			dismiss();
		};
		document.addEventListener("keydown", onKeyDown, true);
		return () => {
			document.removeEventListener("keydown", onKeyDown, true);
		};
	}, [
		dismiss,
		openOnClick,
		visible
	]);
	const content = visible && !suppressed && jsxs("span", {
		ref: bubble,
		id: openOnClick ? id : void 0,
		className: css$16.bubble,
		"data-side": side,
		"data-portal": portal || void 0,
		"data-pinned": pinned || void 0,
		"data-align": align,
		"data-has-shortcut": shortcutKeys?.length ? true : void 0,
		style: {
			left: pos.x,
			top: y,
			visibility: "hidden",
			...maxWidth === void 0 ? {} : { maxWidth }
		},
		role: "tooltip",
		"aria-label": shortcutKeys?.length ? [resolvedLabel, shortcutKeys.join(" ")].filter(Boolean).join(" ") : void 0,
		children: [resolvedLabel && jsx("span", {
			className: css$16.label,
			children: resolvedLabel
		}), shortcutKeys !== void 0 && shortcutKeys.length > 0 && jsx(ShortcutKeys, {
			keys: shortcutKeys,
			variant: "tooltip"
		})]
	});
	return jsxs(TooltipSuppression.Provider, {
		value: setSuppressed,
		children: [cloneElement(children, {
			ref: mergedRef,
			"aria-describedby": openOnClick && visible ? [children.props["aria-describedby"], id].filter(Boolean).join(" ") : children.props["aria-describedby"],
			onMouseEnter: (e) => {
				children.props.onMouseEnter?.(e);
				triggers.current.hover = true;
				showAfterDelay(delayMs);
			},
			onMouseLeave: (e) => {
				children.props.onMouseLeave?.(e);
				triggers.current.hover = false;
				cancelShow();
				if (!pinned) withdraw();
			},
			onClick: (e) => {
				children.props.onClick?.(e);
				triggers.current.focus = false;
				cancelShow();
				if (openOnClick && !disabled && !pinned) {
					setPinned(true);
					show();
				} else withdraw();
			},
			onFocus: (e) => {
				children.props.onFocus?.(e);
				if (pointerModality()) return;
				triggers.current.focus = true;
				showAfterDelay(focusDelayMs);
			},
			onBlur: (e) => {
				children.props.onBlur?.(e);
				triggers.current.focus = false;
				hide();
			}
		}), portal ? content !== false && createPortal(content, document.body) : content]
	});
}
//#endregion
//#region lib/types/HoverCard.js
/** Preview opacity transition and retained lifetime during dismissal. */
const PREVIEW_FADE_MS = 100;
const PREVIEW_MAX_HEIGHT = 420;
const PREVIEW_INSET = 24;
const INLINE_PREVIEW_WIDTH = 300;
const ANCHOR_GAP = 8;
const VIEWPORT_MARGIN = 8;
/**
* Render an anchor with a hover-triggered preview card, hidden while a tooltip within the anchor is visible.
* @param props.anchor - the hover target (rendered in place inside a wrapper span).
* @param props.content - card content; the pointer may rest on it, so it is
* readable and selectable, but it carries no dismissal affordance of its own.
* @param props.openDelayMs - hover dwell before the card shows (default 500).
* @param props.variant - compact card beside the anchor, or a preview above/below it
* with 24px side insets, a 420px height cap, frame-top clearance, and 100ms opacity transitions.
* @param props.widthAnchorRef - optional element whose width and horizontal position size the preview.
* @param props.inline - keep the anchor in prose; show a contained preview on hover or keyboard focus.
* @param props.disabled - suppress opening; turning true dismisses an open card.
* @param props.copyText - optional primary value copied by activation and
* included in the card's accessible name.
* @param props.copyLabel - localized accessible activation-label prefix.
* @param props.copiedLabel - localized visible success label.
* @returns anchor wrapper with the conditional portaled card.
*/
function HoverCard({ anchor, content, openDelayMs = 500, disabled = false, copyText, copyLabel, copiedLabel, variant = "compact", widthAnchorRef, inline = false }) {
	const rootRef = useRef(null);
	const cardRef = useRef(null);
	const timerRef = useRef(null);
	const copyTimerRef = useRef(null);
	const copyHeightRef = useRef(null);
	const copyEpochRef = useRef(0);
	const copyingRef = useRef(false);
	const mountedRef = useRef(true);
	const [phase, setPhase] = useState("closed");
	const open = phase !== "closed";
	const closing = phase === "closing";
	const [pos, setPos] = useState(null);
	const positioned = pos !== null;
	const [copied, setCopied] = useState(false);
	const [suppressed, setSuppressed] = useState(false);
	const clearCopied = useCallback(() => {
		if (copyTimerRef.current !== null) {
			clearTimeout(copyTimerRef.current);
			copyTimerRef.current = null;
		}
		copyHeightRef.current = null;
		setCopied(false);
	}, []);
	const close = useCallback(() => {
		copyEpochRef.current += 1;
		clearCopied();
		setPhase((current) => variant === "preview" && current !== "closed" ? "closing" : "closed");
	}, [clearCopied, variant]);
	const { arm: armClose, cancel: cancelClose } = usePointerGrace(close);
	const clearTimer = () => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	};
	useEffect(() => {
		if (!closing) return;
		const timer = setTimeout(() => {
			setPhase("closed");
		}, PREVIEW_FADE_MS);
		return () => {
			clearTimeout(timer);
		};
	}, [closing]);
	useEffect(() => {
		if (!disabled) return;
		clearTimer();
		cancelClose();
		close();
	}, [
		disabled,
		cancelClose,
		close
	]);
	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			copyEpochRef.current += 1;
			clearTimer();
			if (copyTimerRef.current !== null) {
				clearTimeout(copyTimerRef.current);
				copyTimerRef.current = null;
			}
		};
	}, []);
	useEffect(() => {
		if (!open || variant !== "preview" && !inline) return;
		const dismiss = (event) => {
			if (event.key !== "Escape") return;
			if (inline) event.stopPropagation();
			clearTimer();
			cancelClose();
			close();
		};
		window.addEventListener("keydown", dismiss, inline);
		return () => {
			window.removeEventListener("keydown", dismiss, inline);
		};
	}, [
		open,
		variant,
		inline,
		cancelClose,
		close
	]);
	useLayoutEffect(() => {
		if (!open) {
			setPos(null);
			return;
		}
		const place = () => {
			const wrapper = rootRef.current;
			/* v8 ignore next -- the ref is attached before the layout effect runs and the listeners die with it. */
			if (wrapper === null) return;
			const r = wrapper.getBoundingClientRect();
			const h = cardRef.current?.offsetHeight ?? 0;
			if (variant === "preview") {
				const bounds = widthAnchorRef?.current?.getBoundingClientRect() ?? r;
				const width = Math.max(0, Math.min(bounds.width - PREVIEW_INSET * 2, window.innerWidth - VIEWPORT_MARGIN * 2));
				const topMargin = overlayTopMargin(VIEWPORT_MARGIN);
				const belowTop = Math.max(topMargin, r.bottom + ANCHOR_GAP);
				const above = Math.max(0, r.top - ANCHOR_GAP - topMargin);
				const below = Math.max(0, window.innerHeight - belowTop - VIEWPORT_MARGIN);
				const onTop = above >= Math.min(PREVIEW_MAX_HEIGHT, below);
				const maxHeight = Math.min(PREVIEW_MAX_HEIGHT, onTop ? above : below);
				setPos({
					left: Math.max(VIEWPORT_MARGIN, Math.min(bounds.left + PREVIEW_INSET, window.innerWidth - width - VIEWPORT_MARGIN)),
					top: onTop ? Math.max(topMargin, r.top - Math.min(h, maxHeight) - ANCHOR_GAP) : belowTop,
					width,
					maxHeight
				});
				return;
			}
			if (inline) {
				const height = Math.max(h, cardRef.current?.scrollHeight ?? 0);
				const width = Math.max(0, Math.min(INLINE_PREVIEW_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2));
				const topMargin = overlayTopMargin(VIEWPORT_MARGIN);
				const belowTop = Math.max(topMargin, r.bottom + ANCHOR_GAP);
				const above = Math.max(0, r.top - ANCHOR_GAP - topMargin);
				const below = Math.max(0, window.innerHeight - belowTop - VIEWPORT_MARGIN);
				const onTop = height > below && above > below;
				const maxHeight = onTop ? above : below;
				setPos({
					left: Math.max(VIEWPORT_MARGIN, Math.min(r.left, window.innerWidth - width - VIEWPORT_MARGIN)),
					top: onTop ? r.top - ANCHOR_GAP - Math.min(height, maxHeight) : belowTop,
					width,
					maxHeight
				});
				return;
			}
			const top = r.top + h > window.innerHeight - VIEWPORT_MARGIN ? window.innerHeight - h - VIEWPORT_MARGIN : r.top;
			setPos({
				left: r.right + ANCHOR_GAP,
				top
			});
		};
		place();
		const observer = (variant === "preview" || inline) && typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
		for (const element of [
			cardRef.current,
			rootRef.current,
			widthAnchorRef?.current
		]) if (element !== null && element !== void 0) observer?.observe(element);
		window.addEventListener("scroll", place, true);
		window.addEventListener("resize", place);
		return () => {
			observer?.disconnect();
			window.removeEventListener("scroll", place, true);
			window.removeEventListener("resize", place);
		};
	}, [
		open,
		variant,
		widthAnchorRef,
		positioned,
		inline
	]);
	useLayoutEffect(() => {
		if (!open || pos === null || variant === "preview" || inline || suppressed) return;
		/* v8 ignore next -- the card is mounted whenever pos is set, so the ref is attached here. */
		const h = cardRef.current?.offsetHeight ?? 0;
		if (pos.top + h > window.innerHeight - VIEWPORT_MARGIN) setPos({
			left: pos.left,
			top: window.innerHeight - h - VIEWPORT_MARGIN
		});
	}, [
		open,
		pos,
		variant,
		inline,
		suppressed
	]);
	const copy = async (text) => {
		if (copied || copyingRef.current) return;
		copyingRef.current = true;
		const copyEpoch = copyEpochRef.current;
		const accepted = await writeClipboard(text);
		copyingRef.current = false;
		const card = cardRef.current;
		if (!accepted || !mountedRef.current || copyEpoch !== copyEpochRef.current || card === null) return;
		const height = card.offsetHeight;
		copyHeightRef.current = height > 0 ? height : null;
		setCopied(true);
		copyTimerRef.current = setTimeout(clearCopied, 1e3);
	};
	const copyable = copyText !== void 0;
	const dismissFromAnchor = (event) => {
		if (cardRef.current?.contains(event.target)) return;
		clearTimer();
		cancelClose();
		close();
	};
	const card = open && pos !== null && !suppressed && jsx("div", {
		ref: cardRef,
		className: clsx(css$17.card, variant === "preview" && css$17.preview, inline && css$17.media, copyable && css$17.copyable, copied && css$17.feedback),
		"data-closing": closing || void 0,
		style: {
			...pos,
			minHeight: copied && copyHeightRef.current !== null ? copyHeightRef.current : void 0,
			"--dsh-hover-preview-fade": `${PREVIEW_FADE_MS}ms`
		},
		role: copyable ? "button" : void 0,
		tabIndex: copyable ? 0 : void 0,
		"aria-label": copyable ? `${copyLabel}: ${copyText}` : void 0,
		onClick: copyable ? (e) => {
			const selection = window.getSelection();
			if (selection !== null && !selection.isCollapsed) {
				for (let i = 0; i < selection.rangeCount; i += 1) if (selection.getRangeAt(i).intersectsNode(e.currentTarget)) return;
			}
			copy(copyText);
		} : void 0,
		onKeyDown: copyable ? (e) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			copy(copyText);
		} : void 0,
		children: copied ? jsx("span", {
			className: css$17.copied,
			"aria-hidden": "true",
			children: copiedLabel
		}) : content
	});
	return jsxs("span", {
		ref: rootRef,
		className: clsx(css$17.root, inline && css$17.inline),
		onFocus: inline ? (event) => {
			if (!disabled && event.target.matches(":focus-visible")) {
				cancelClose();
				setPhase("open");
			}
		} : void 0,
		onBlur: inline ? (event) => {
			if (!event.currentTarget.contains(event.relatedTarget)) {
				clearTimer();
				cancelClose();
				close();
			}
		} : void 0,
		onPointerEnter: (event) => {
			if (disabled || inline && event.pointerType === "touch") return;
			cancelClose();
			if (open) {
				setPhase("open");
				return;
			}
			clearTimer();
			timerRef.current = setTimeout(() => {
				setPhase("open");
			}, openDelayMs);
		},
		onPointerLeave: () => {
			clearTimer();
			if (open) armClose();
		},
		onPointerDownCapture: dismissFromAnchor,
		onClickCapture: dismissFromAnchor,
		children: [
			jsx(TooltipSuppression.Provider, {
				value: setSuppressed,
				children: anchor
			}),
			open && !suppressed && copyable && jsx("span", {
				className: css$17.status,
				role: "status",
				children: copied ? copiedLabel : ""
			}),
			card !== false && createPortal(card, document.body)
		]
	});
}
//#endregion
//#region lib/types/Modal.js
/**
* Render a centered, body-portaled modal over a blurred page mask.
* @param props.open - whether the dialog is showing.
* @param props.onClose - application close command, Escape, or mask click; while a menu is open inside the
* dialog, Escape belongs to that menu first.
* @param props.title - dialog heading (aria-label in every mode).
* @param props.closeLabel - localized accessible close-button label.
* @param props.description - optional supporting sentence under the title.
* @param props.children - dialog body; mark its initial-focus control with
* data-modal-autofocus instead of React autoFocus to preserve return focus.
* @param props.footer - action row (Cancel / Create).
* @param props.contentClassName - optional class for a scrollable content region.
* @param props.backdropBlur - disable when the caller already blurs the page; defaults to true.
* @param props.shortcutModal - command scope allowed by shortcut owners; unnamed
* dialogs block application commands unless their owner allows the "other" scope.
* @param props.headless - render children directly in the card (no default
* header/close/body chrome); mask, card, Escape, and aria-label remain.
* @param props.onKeyDownCapture - handle a nested dialog's keys before the document Escape listeners.
* @returns null when closed; otherwise the overlay tree.
*/
function Modal({ open, onClose, title, closeLabel, description, children, footer, className, contentClassName, onKeyDownCapture, headless = false, backdropBlur = true, shortcutModal }) {
	const dialog = useRef(null);
	useModalLayer(dialog, open, onClose);
	if (!open) return null;
	return createPortal(jsxs("div", {
		className: css$18.root,
		role: "presentation",
		onKeyDownCapture,
		children: [jsx("div", {
			className: css$18.mask,
			style: backdropBlur ? void 0 : { backdropFilter: "none" },
			"aria-hidden": "true",
			onClick: onClose
		}), jsx("div", {
			ref: dialog,
			tabIndex: -1,
			"data-shortcut-modal": shortcutModal,
			className: clsx(css$18.dialog, className),
			role: "dialog",
			"aria-modal": "true",
			"aria-label": title,
			children: headless ? children : jsxs(Fragment, { children: [jsxs("div", {
				className: clsx(css$18.content, contentClassName),
				children: [
					jsxs("div", {
						className: css$18.header,
						children: [jsx("h2", {
							className: css$18.title,
							children: title
						}), jsx("button", {
							type: "button",
							className: css$18.close,
							"aria-label": closeLabel,
							onClick: onClose,
							children: jsx(IconCloseOutlineRegular, { size: 14 })
						})]
					}),
					description !== void 0 && description !== "" && jsx("p", {
						className: css$18.description,
						children: description
					}),
					children !== void 0 && jsx("div", {
						className: css$18.body,
						children
					})
				]
			}), footer !== void 0 && jsx("div", {
				className: css$18.footer,
				children: footer
			})] })
		})]
	}), document.body);
}
//#endregion
//#region lib/types/RiskConfirmation.js
/**
* Controlled risk acknowledgement dialog shared by product surfaces that
* must gate a sensitive action behind an explicit checkbox.
*/
/**
* Render one in-page confirmation whose primary action is unavailable until
* the caller-controlled acknowledgement is checked.
*/
function RiskConfirmation({ open, title, description, acknowledgeLabel, cancelLabel, closeLabel, confirmLabel, acknowledged, disabled = false, onAcknowledgedChange, onCancel, onConfirm }) {
	return jsxs(Modal, {
		open,
		onClose: onCancel,
		title,
		closeLabel,
		className: css$19.confirmation ?? "",
		contentClassName: css$19.confirmationContent ?? "",
		footer: jsxs(Fragment, { children: [jsx(Button, {
			variant: "outline",
			className: css$19.modalAction,
			onClick: onCancel,
			children: cancelLabel
		}), jsx(Button, {
			variant: "primary",
			className: css$19.confirmAction,
			disabled: disabled || !acknowledged,
			onClick: onConfirm,
			children: confirmLabel
		})] }),
		children: [jsxs("div", {
			className: css$19.warning,
			children: [jsx(IconWarningOutlineRegular, {
				size: 18,
				className: css$19.warningIcon
			}), jsx("p", { children: description })]
		}), jsxs("label", {
			className: css$19.acknowledgement,
			children: [jsx("input", {
				type: "checkbox",
				checked: acknowledged,
				disabled,
				"data-modal-autofocus": true,
				onChange: (event) => {
					onAcknowledgedChange(event.currentTarget.checked);
				}
			}), jsx("span", { children: acknowledgeLabel })]
		})]
	});
}
//#endregion
//#region lib/types/ConnectionIndicator.js
/** Exit-transition length; keep equal to the `.leaving` transition duration in the stylesheet. */
const EXIT_MS = 150;
/**
* Render an inline connection-recovery control. The outage and retry-attempt
* states are one button whose static label already names the retry action;
* clicking it requests an immediate reconnect. The indicator animates in on
* appearance and fades out for {@link EXIT_MS} before unmounting.
* @param props.state - visible outage, retry-attempt, or recovered state.
* @param props.disconnectedLabel - localized outage text naming the retry action.
* @param props.connectingLabel - localized retry text followed by the attempt dots.
* @param props.recoveredLabel - localized recovery confirmation.
* @param props.reconnectActionLabel - accessible label for the outage action.
* @param props.restartActionLabel - accessible label for replacing an active attempt.
* @param props.onReconnect - request an immediate reconnect attempt.
* @returns the indicator, or null when no connection feedback is active.
*/
function ConnectionIndicator({ state, disconnectedLabel, connectingLabel, recoveredLabel, reconnectActionLabel, restartActionLabel, onReconnect }) {
	const [rendered, setRendered] = useState(state);
	const leaving = state === void 0 && rendered !== void 0;
	useEffect(() => {
		if (state !== void 0) {
			setRendered(state);
			return;
		}
		if (rendered === void 0) return;
		const timeout = window.setTimeout(() => {
			setRendered(void 0);
		}, EXIT_MS);
		return () => {
			window.clearTimeout(timeout);
		};
	}, [state, rendered]);
	if (rendered === void 0) return null;
	const leavingClass = leaving ? ` ${css$20.leaving}` : "";
	if (rendered === "recovered") return jsxs("div", {
		className: `${css$20.indicator} ${css$20.success}${leavingClass}`,
		role: "status",
		"aria-label": recoveredLabel,
		children: [jsx("span", {
			className: css$20.icon,
			"aria-hidden": "true",
			children: jsx(IconCheckOutlineRegular, { size: 14 })
		}), jsx("span", {
			className: css$20.label,
			children: recoveredLabel
		})]
	});
	const connecting = rendered === "connecting";
	return jsxs("button", {
		type: "button",
		className: `${css$20.indicator} ${css$20.warning}${leavingClass}`,
		"data-phase": rendered,
		"aria-label": connecting ? restartActionLabel : reconnectActionLabel,
		onClick: onReconnect,
		children: [jsx("span", {
			className: css$20.icon,
			"aria-hidden": "true",
			children: connecting ? jsx(StateDot, { state: "ongoing" }) : jsx(IconRefreshOutlineRegular, { size: 14 })
		}), jsx("span", {
			className: css$20.label,
			children: connecting ? jsxs(Fragment, { children: [connectingLabel, jsxs("span", {
				className: css$20.dots,
				"aria-hidden": "true",
				children: [
					jsx("span", { children: "." }),
					jsx("span", {
						className: css$20.secondDot,
						children: "."
					}),
					jsx("span", {
						className: css$20.thirdDot,
						children: "."
					})
				]
			})] }) : disconnectedLabel
		})]
	});
}
//#endregion
//#region lib/types/FishLogo.js
/** Native viewBox of {@link FISH_LOGO_PATH} (width and height in user units). */
const FISH_LOGO_VIEWBOX = {
	width: 23.16,
	height: 17.04
};
/** The fish silhouette path data, exported for consumers that compose their own svg (entrance effects, masks) around the same geometry. */
const FISH_LOGO_PATH = "M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z";
/**
* Render the fish logo.
* @param props.size - width in px (default 24; height keeps the 23.16:17.04 ratio).
* @param props.className - extra class for layout placement.
* @returns the logo svg (aria-hidden; pair with the wordmark for accessibility).
*/
function FishLogo({ size = 24, className }) {
	return jsx("svg", {
		width: size,
		height: size * FISH_LOGO_VIEWBOX.height / FISH_LOGO_VIEWBOX.width,
		className,
		viewBox: `0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height}`,
		fill: "none",
		"aria-hidden": "true",
		children: jsx("path", {
			d: FISH_LOGO_PATH,
			fill: "currentColor"
		})
	});
}
//#endregion
//#region lib/types/BrandWordmark.js
/**
* Render the full brand wordmark.
* @param props.size - height in px (default 24; width follows the selected artwork).
* @param props.className - extra class for layout placement.
* @param props.includeMark - whether to include the leading whale mark.
* @returns the wordmark svg (aria-hidden decorative brand art).
*/
function BrandWordmark({ size = 24, className, includeMark = true }) {
	return jsxs("svg", {
		width: size * (includeMark ? 182 : 156) / 24,
		height: size,
		className,
		viewBox: includeMark ? "0 0 182 24" : "26 0 156 24",
		fill: "none",
		"aria-hidden": "true",
		children: [
			jsx("path", {
				d: "M68.416 18.2447H67.0501V16.1272H68.416C69.2619 16.1272 70.1166 15.9163 70.6671 15.3304C71.2181 14.7444 71.426 13.8455 71.426 12.9471C71.426 12.0487 71.2268 11.1498 70.6671 10.5643C70.1083 9.97831 69.2619 9.76744 68.416 9.76744C67.5701 9.76744 66.7154 9.97831 66.1639 10.5643C65.6129 11.1503 65.4049 12.0487 65.4049 12.9471V21.6435H63.009V7.6582H65.4049V8.54883H65.8442C65.8918 8.49393 65.9394 8.44728 65.9875 8.40064C66.5871 7.85353 67.5049 7.6582 68.4072 7.6582C69.8212 7.6582 71.2341 8.00998 72.1607 8.98662C73.0868 9.96325 73.4143 11.4632 73.4143 12.9558C73.4143 14.4485 73.0785 15.9406 72.1607 16.925C71.2424 17.9094 69.8212 18.2457 68.416 18.2457V18.2447Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M31.9551 8.03497H33.3204V10.1525H31.9551C31.1087 10.1525 30.2545 10.3633 29.7035 10.9493C29.1525 11.5353 28.945 12.4342 28.945 13.3326C28.945 14.231 29.1447 15.1294 29.7035 15.7154C30.2623 16.3014 31.1087 16.5122 31.9551 16.5122C32.8015 16.5122 33.6562 16.3014 34.2072 15.7154C34.7582 15.1294 34.9657 14.231 34.9657 13.3326V4.62842H37.3611V18.6219H34.9657V17.7313H34.5264C34.4783 17.7857 34.4307 17.8329 34.3826 17.8795C33.7835 18.4261 32.8652 18.6219 31.9629 18.6219C30.5494 18.6219 29.136 18.2707 28.2099 17.294C27.2838 16.3174 26.9563 14.817 26.9563 13.3248C26.9563 11.8327 27.2916 10.34 28.2099 9.35561C29.136 8.37898 30.5494 8.03497 31.9551 8.03497Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M49.3786 13.1431V13.9948H42.9984V12.2996H47.2305C47.1348 11.6825 46.9113 11.1043 46.5119 10.682C45.9371 10.0727 45.0503 9.85409 44.1723 9.85409C43.2943 9.85409 42.4076 10.0727 41.8328 10.682C41.258 11.2913 41.05 12.2213 41.05 13.1435C41.05 14.0658 41.2575 15.003 41.8328 15.6046C42.4076 16.2061 43.2939 16.433 44.1723 16.433C45.0508 16.433 45.9371 16.2143 46.5119 15.6046C46.5916 15.5186 46.6635 15.4248 46.7354 15.331H49.0992C48.8918 16.0657 48.5643 16.7299 48.0691 17.2454C47.111 18.2531 45.6339 18.6205 44.1723 18.6205C42.7108 18.6205 41.2337 18.2609 40.2755 17.2454C39.3174 16.2299 38.9661 14.6828 38.9661 13.1435C38.9661 11.6043 39.3096 10.0494 40.2755 9.04168C41.242 8.03396 42.7108 7.66663 44.1723 7.66663C45.6339 7.66663 47.111 8.02618 48.0691 9.04168C49.0351 10.0572 49.3786 11.6043 49.3786 13.1435V13.1431Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M61.4045 13.1431V13.9948H55.0243V12.2996H59.2564C59.1602 11.6825 58.9372 11.1043 58.5378 10.682C57.963 10.0727 57.0762 9.85409 56.1982 9.85409C55.3202 9.85409 54.4335 10.0727 53.8587 10.682C53.2839 11.2913 53.0759 12.2213 53.0759 13.1435C53.0759 14.0658 53.2834 15.003 53.8587 15.6046C54.4335 16.2061 55.3202 16.433 56.1982 16.433C57.0762 16.433 57.963 16.2143 58.5378 15.6046C58.6179 15.5186 58.6894 15.4248 58.7608 15.331H61.1251C60.9171 16.0657 60.5897 16.7299 60.0945 17.2454C59.1364 18.2531 57.6593 18.6205 56.1982 18.6205C54.7372 18.6205 53.2596 18.2609 52.3014 17.2454C51.3432 16.2299 50.9919 14.6828 50.9919 13.1435C50.9919 11.6043 51.3355 10.0494 52.3014 9.04168C53.2678 8.03396 54.7367 7.66663 56.1982 7.66663C57.6598 7.66663 59.1364 8.02618 60.0945 9.04168C61.061 10.0572 61.4045 11.6043 61.4045 13.1435V13.1431Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M80.242 18.6214C81.7035 18.6214 83.1801 18.4105 84.1383 17.809C85.0965 17.2075 85.4482 16.2931 85.4482 15.3869C85.4482 14.4807 85.1042 13.5585 84.1383 12.9647C83.1801 12.371 81.703 12.1518 80.242 12.1518C79.6186 12.1518 79.0438 12.0658 78.6366 11.8394C78.2294 11.6047 78.0778 11.2534 78.0778 10.9017C78.0778 10.5499 78.2216 10.1908 78.6366 9.9639C79.0438 9.72921 79.6749 9.65147 80.2973 9.65147C80.9198 9.65147 81.5509 9.73747 81.9591 9.9639C82.3663 10.1986 82.5179 10.5499 82.5179 10.9017H84.9531C84.9531 9.99499 84.6421 9.07327 83.7719 8.47951C82.9017 7.88576 81.5679 7.66663 80.2424 7.66663C78.9169 7.66663 77.5837 7.8775 76.713 8.47951C75.8427 9.08104 75.5308 9.99499 75.5308 10.9017C75.5308 11.8083 75.8423 12.73 76.713 13.3238C77.5832 13.9176 78.9165 14.1367 80.2424 14.1367C80.929 14.1367 81.688 14.2227 82.1428 14.4491C82.5985 14.676 82.7579 15.0351 82.7579 15.3869C82.7579 15.7387 82.5985 16.0977 82.1428 16.3246C81.688 16.5511 80.9931 16.6371 80.3066 16.6371C79.62 16.6371 78.9169 16.5511 78.4694 16.3246C78.0224 16.0982 77.8543 15.7387 77.8543 15.3869H75.0435C75.0435 16.2935 75.3865 17.2153 76.3534 17.809C77.3194 18.4028 78.7809 18.6214 80.2424 18.6214H80.242Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M97.4733 13.1431V13.9948H91.0932V12.2996H95.3252C95.23 11.6825 95.006 11.1043 94.6071 10.682C94.0313 10.0727 93.1456 9.85409 92.2666 9.85409C91.3876 9.85409 90.5018 10.0727 89.927 10.682C89.3522 11.2913 89.1452 12.2213 89.1452 13.1435C89.1452 14.0658 89.3522 15.003 89.927 15.6046C90.5018 16.2061 91.3886 16.433 92.2666 16.433C93.1446 16.433 94.0313 16.2143 94.6071 15.6046C94.6863 15.5186 94.7587 15.4248 94.8301 15.331H97.1935C96.9855 16.0657 96.6585 16.7299 96.1639 17.2454C95.2057 18.2531 93.7281 18.6205 92.2666 18.6205C90.805 18.6205 89.3284 18.2609 88.3703 17.2454C87.4121 16.2299 87.0613 14.6828 87.0613 13.1435C87.0613 11.6043 87.4043 10.0494 88.3703 9.04168C89.3367 8.03396 90.806 7.66663 92.2666 7.66663C93.7272 7.66663 95.2057 8.02618 96.1639 9.04168C97.1298 10.0572 97.4729 11.6043 97.4729 13.1435L97.4733 13.1431Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M109.499 13.1431V13.9948H103.119V12.2996H107.351C107.256 11.6825 107.032 11.1043 106.632 10.682C106.057 10.0727 105.172 9.85409 104.293 9.85409C103.414 9.85409 102.528 10.0727 101.953 10.682C101.378 11.2913 101.17 12.2213 101.17 13.1435C101.17 14.0658 101.378 15.003 101.953 15.6046C102.528 16.2061 103.415 16.433 104.293 16.433C105.171 16.433 106.057 16.2143 106.632 15.6046C106.712 15.5186 106.784 15.4248 106.856 15.331H109.22C109.012 16.0657 108.685 16.7299 108.19 17.2454C107.231 18.2531 105.754 18.6205 104.293 18.6205C102.831 18.6205 101.355 18.2609 100.396 17.2454C99.4382 16.2299 99.0864 14.6828 99.0864 13.1435C99.0864 11.6043 99.4295 10.0494 100.396 9.04168C101.362 8.03396 102.832 7.66663 104.293 7.66663C105.754 7.66663 107.231 8.02618 108.19 9.04168C109.156 10.0572 109.499 11.6043 109.499 13.1435V13.1431Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M113.5 4.62817H111.104V18.6217H113.5V4.62817Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M117.589 12.8154L121.517 18.6208H118.554L114.625 12.8154L118.554 8.15088H121.517L117.589 12.8154Z",
				fill: "currentColor"
			}),
			jsx("g", {
				clipPath: "url(#dsh-wordmark-whale-clip)",
				children: jsx("path", {
					d: "M23.0584 4.95203C22.8129 4.83203 22.7074 5.06103 22.5639 5.17704C22.5149 5.21454 22.4734 5.26354 22.4319 5.30854C22.0734 5.69155 21.6543 5.94306 21.1073 5.91306C20.3073 5.86806 19.6243 6.11957 19.0203 6.73158C18.8918 5.97706 18.4652 5.52655 17.8162 5.23754C17.4767 5.08753 17.1332 4.93703 16.8952 4.61052C16.7292 4.37801 16.6837 4.11901 16.6007 3.8635C16.5477 3.70949 16.4952 3.55199 16.3177 3.52549C16.1252 3.49549 16.0497 3.65699 15.9742 3.792C15.6722 4.34401 15.5552 4.95203 15.5667 5.56805C15.5932 6.95359 16.1782 8.05712 17.3407 8.84215C17.4727 8.93215 17.5067 9.02215 17.4652 9.15366C17.3857 9.42416 17.2917 9.68667 17.2087 9.95718C17.1557 10.1297 17.0767 10.1677 16.8917 10.0922C16.2537 9.82568 15.7027 9.43117 15.2156 8.95465C14.3891 8.15513 13.6416 7.2726 12.7096 6.58158C12.4906 6.42007 12.2716 6.27007 12.045 6.12707C11.094 5.20354 12.1696 4.44502 12.4186 4.35501C12.6791 4.26101 12.5091 3.938 11.6675 3.942C10.826 3.9455 10.056 4.22751 9.07446 4.60302C8.93096 4.65952 8.77995 4.70052 8.62545 4.73452C7.73492 4.56552 6.80989 4.52802 5.84386 4.63702C4.02481 4.83953 2.57177 5.69955 1.50373 7.1676C0.220694 8.93215 -0.0813148 10.9372 0.288196 13.0283C0.676708 15.2323 1.80174 17.0569 3.53029 18.4834C5.32285 19.9625 7.38741 20.6875 9.74298 20.5485C11.1735 20.466 12.7661 20.2745 14.5626 18.7539C15.0156 18.9795 15.4912 19.0695 16.2797 19.137C16.8872 19.1935 17.4722 19.107 17.9252 19.013C18.6347 18.8629 18.5857 18.2059 18.3292 18.0854C16.2497 17.1169 16.7062 17.5109 16.2912 17.1919C17.3477 15.9419 18.9618 13.7198 19.4598 10.6942C19.5088 10.3602 19.5713 9.88968 19.5638 9.61917C19.5598 9.45417 19.5978 9.39016 19.7863 9.37116C20.3073 9.31116 20.8128 9.16866 21.2773 8.91315C22.6249 8.17713 23.1684 6.96809 23.2964 5.51905C23.3154 5.29754 23.2924 5.06853 23.0584 4.95203ZM11.3165 17.9954C9.30097 16.4109 8.32344 15.8894 7.91992 15.9119C7.54241 15.9344 7.61042 16.3664 7.69342 16.6479C7.78042 16.9259 7.89342 17.1174 8.05193 17.3614C8.16143 17.5229 8.23694 17.7629 7.94243 17.9434C7.29341 18.3449 6.16487 17.8084 6.11187 17.7819C4.79833 17.0084 3.7003 15.9874 2.92628 14.5908C2.17875 13.2468 1.74474 11.8047 1.67324 10.2657C1.65424 9.89418 1.76374 9.76267 2.13375 9.69517C2.62077 9.60517 3.12278 9.58617 3.6093 9.65767C5.66636 9.95818 7.41741 10.8777 8.88545 12.3348C9.72348 13.1643 10.3575 14.1558 11.0105 15.1243C11.705 16.1529 12.4521 17.1329 13.4036 17.9364C13.7396 18.2179 14.0076 18.4319 14.2641 18.5899C13.4906 18.6764 12.1996 18.6949 11.3165 17.9964V17.9954ZM12.2826 11.7817C12.2826 11.6167 12.4146 11.4852 12.5806 11.4852C12.6181 11.4852 12.6521 11.4927 12.6826 11.5037C12.7241 11.5187 12.7621 11.5412 12.7921 11.5752C12.8451 11.6277 12.8751 11.7027 12.8751 11.7817C12.8751 11.9467 12.7431 12.0782 12.5771 12.0782C12.4111 12.0782 12.2826 11.9467 12.2826 11.7817ZM15.2831 13.3208C15.0906 13.3998 14.8981 13.4673 14.7131 13.4748C14.4261 13.4898 14.1131 13.3733 13.9431 13.2308C13.6791 13.0093 13.4901 12.8853 13.4111 12.4988C13.3771 12.3338 13.3961 12.0782 13.4261 11.9317C13.4941 11.6162 13.4186 11.4137 13.1961 11.2297C13.0151 11.0797 12.7846 11.0382 12.5316 11.0382C12.4371 11.0382 12.3506 10.9967 12.2861 10.9632C12.1806 10.9107 12.0936 10.7792 12.1766 10.6177C12.2031 10.5652 12.3316 10.4377 12.3616 10.4152C12.7051 10.2197 13.1011 10.2837 13.4676 10.4302C13.8071 10.5692 14.0641 10.8242 14.4336 11.1847C14.8111 11.6202 14.8791 11.7402 15.0941 12.0672C15.2641 12.3228 15.4186 12.5853 15.5247 12.8858C15.5887 13.0733 15.5057 13.2268 15.2831 13.3208Z",
					fill: "currentColor"
				})
			}),
			jsx("rect", {
				x: "129.348",
				y: "5.5",
				width: "52",
				height: "14",
				rx: "2",
				fill: "currentColor"
			}),
			jsxs("g", {
				clipPath: "url(#dsh-wordmark-badge-clip)",
				children: [
					jsx("path", {
						d: "M132.848 8.93205H134.08V16.137H132.848V8.93205ZM136.5 8.93205H137.732V16.137H136.5V8.93205ZM133.365 13.024V11.99H137.193V13.024H133.365Z",
						fill: "var(--dsw-alias-label-primary-inverted)"
					}),
					jsx("path", {
						d: "M140.397 14.432L140.672 13.453H143.202L143.532 14.432H140.397ZM140.287 16.137H139.055L141.277 8.93205H142.201L142.146 9.74605L140.947 13.915H140.969L140.287 16.137ZM145.039 16.137H143.741L143.07 13.948L143.081 13.937L141.871 9.74605L141.926 8.93205H142.817L145.039 16.137Z",
						fill: "var(--dsw-alias-label-primary-inverted)"
					}),
					jsx("path", {
						d: "M146.846 8.93205H149.068C149.852 8.93205 150.443 9.11538 150.839 9.48205C151.235 9.84138 151.433 10.3327 151.433 10.956C151.433 11.22 151.396 11.4657 151.323 11.693C151.249 11.9204 151.125 12.1257 150.949 12.309C150.773 12.4924 150.531 12.65 150.223 12.782C149.922 12.9067 149.541 13.0057 149.079 13.079V13.321H146.846V12.639L148.023 12.485C148.631 12.4044 149.09 12.298 149.398 12.166C149.706 12.034 149.915 11.8764 150.025 11.693C150.135 11.5024 150.19 11.2934 150.19 11.066C150.19 10.6994 150.083 10.417 149.871 10.219C149.658 10.021 149.324 9.92205 148.87 9.92205H146.846V8.93205ZM146.395 8.93205H147.627V16.137H146.395V8.93205ZM151.917 16.093V16.137H150.366L149.024 14.322C148.87 14.1094 148.73 13.9407 148.606 13.816C148.481 13.684 148.345 13.5887 148.199 13.53C148.052 13.464 147.872 13.42 147.66 13.398C147.447 13.3687 147.176 13.3504 146.846 13.343V13.145H149.079C149.233 13.211 149.368 13.2844 149.486 13.365C149.61 13.4457 149.735 13.5447 149.86 13.662C149.992 13.7794 150.138 13.937 150.3 14.135L151.917 16.093Z",
						fill: "var(--dsw-alias-label-primary-inverted)"
					}),
					jsx("path", {
						d: "M153.58 9.57005L153.591 8.93205H154.46L157.584 15.51V16.137H156.704L153.58 9.57005ZM158.024 16.137H156.968L156.88 8.93205H158.024V16.137ZM154.24 16.137H153.096V8.93205H154.152L154.24 16.137Z",
						fill: "var(--dsw-alias-label-primary-inverted)"
					}),
					jsx("path", {
						d: "M159.963 8.93205H161.206V16.137H159.963V8.93205ZM160.095 9.96605V8.93205H164.858V9.96605H160.095ZM160.095 16.137V15.103H164.902V16.137H160.095ZM160.095 13.013V11.99H164.374V13.013H160.095Z",
						fill: "var(--dsw-alias-label-primary-inverted)"
					}),
					jsx("path", {
						d: "M169.052 15.257C169.543 15.257 169.895 15.1654 170.108 14.982C170.328 14.7987 170.438 14.5457 170.438 14.223C170.438 14.047 170.405 13.8967 170.339 13.772C170.273 13.6474 170.152 13.5337 169.976 13.431C169.807 13.321 169.558 13.2147 169.228 13.112L168.491 12.881C167.846 12.6757 167.38 12.4044 167.094 12.067C166.808 11.7297 166.665 11.3007 166.665 10.78C166.665 10.428 166.76 10.1017 166.951 9.80105C167.142 9.50038 167.428 9.25838 167.809 9.07505C168.19 8.89172 168.663 8.80005 169.228 8.80005C169.631 8.80005 169.998 8.82938 170.328 8.88805C170.665 8.93938 171.039 9.01638 171.45 9.11905L171.274 10.175C170.834 10.0504 170.442 9.96238 170.097 9.91105C169.76 9.85238 169.463 9.82305 169.206 9.82305C168.737 9.82305 168.403 9.90738 168.205 10.076C168.007 10.2374 167.908 10.439 167.908 10.681C167.908 10.857 167.941 11.0147 168.007 11.154C168.073 11.286 168.19 11.407 168.359 11.517C168.535 11.627 168.784 11.7334 169.107 11.836L169.866 12.078C170.526 12.276 170.995 12.5327 171.274 12.848C171.553 13.156 171.692 13.585 171.692 14.135C171.692 14.5604 171.589 14.9344 171.384 15.257C171.179 15.5797 170.878 15.8327 170.482 16.016C170.093 16.1994 169.609 16.291 169.03 16.291C168.627 16.291 168.212 16.247 167.787 16.159C167.362 16.071 166.9 15.9427 166.401 15.774L166.665 14.718C167.156 14.894 167.6 15.0297 167.996 15.125C168.399 15.213 168.751 15.257 169.052 15.257Z",
						fill: "var(--dsw-alias-label-primary-inverted)"
					}),
					jsx("path", {
						d: "M175.809 15.257C176.3 15.257 176.652 15.1654 176.865 14.982C177.085 14.7987 177.195 14.5457 177.195 14.223C177.195 14.047 177.162 13.8967 177.096 13.772C177.03 13.6474 176.909 13.5337 176.733 13.431C176.564 13.321 176.315 13.2147 175.985 13.112L175.248 12.881C174.603 12.6757 174.137 12.4044 173.851 12.067C173.565 11.7297 173.422 11.3007 173.422 10.78C173.422 10.428 173.517 10.1017 173.708 9.80105C173.899 9.50038 174.185 9.25838 174.566 9.07505C174.947 8.89172 175.42 8.80005 175.985 8.80005C176.388 8.80005 176.755 8.82938 177.085 8.88805C177.422 8.93938 177.796 9.01638 178.207 9.11905L178.031 10.175C177.591 10.0504 177.199 9.96238 176.854 9.91105C176.517 9.85238 176.22 9.82305 175.963 9.82305C175.494 9.82305 175.16 9.90738 174.962 10.076C174.764 10.2374 174.665 10.439 174.665 10.681C174.665 10.857 174.698 11.0147 174.764 11.154C174.83 11.286 174.947 11.407 175.116 11.517C175.292 11.627 175.541 11.7334 175.864 11.836L176.623 12.078C177.283 12.276 177.752 12.5327 178.031 12.848C178.31 13.156 178.449 13.585 178.449 14.135C178.449 14.5604 178.346 14.9344 178.141 15.257C177.936 15.5797 177.635 15.8327 177.239 16.016C176.85 16.1994 176.366 16.291 175.787 16.291C175.384 16.291 174.969 16.247 174.544 16.159C174.119 16.071 173.657 15.9427 173.158 15.774L173.422 14.718C173.913 14.894 174.357 15.0297 174.753 15.125C175.156 15.213 175.508 15.257 175.809 15.257Z",
						fill: "var(--dsw-alias-label-primary-inverted)"
					})
				]
			}),
			jsxs("defs", { children: [jsx("clipPath", {
				id: "dsh-wordmark-whale-clip",
				children: jsx("rect", {
					width: "23.16",
					height: "17.0435",
					fill: "white",
					transform: "translate(0.141602 3.52185)"
				})
			}), jsx("clipPath", {
				id: "dsh-wordmark-badge-clip",
				children: jsx("rect", {
					width: "46",
					height: "14",
					fill: "white",
					transform: "translate(132.348 5.5)"
				})
			})] })
		]
	});
}
//#endregion
//#region lib/types/PermissionIcon.js
function ReadOnlyArtwork({ size = 16, className, strokeWidth }) {
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 16 16",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": "true",
		strokeWidth,
		children: [jsx("path", {
			d: "M5.08545 8.13775L7.18455 10.2368C7.26636 10.3187 7.4003 10.3142 7.47649 10.2271L11.5148 5.61194",
			stroke: "currentColor"
		}), jsx("path", {
			d: "M6.59624 2.14853C7.50155 1.80917 8.49914 1.80919 9.40444 2.14859L13.9245 3.84317V7.11961C13.9245 11.6089 10.5565 13.5975 8.00035 14.5779C5.44423 13.5975 2.07544 11.6089 2.07544 7.11961V3.84317L6.59624 2.14853Z",
			stroke: "currentColor",
			strokeLinejoin: "round"
		})]
	});
}
function WorkspaceWriteArtwork({ size = 16, className, strokeWidth }) {
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 16 16",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": "true",
		strokeWidth,
		children: [
			jsx("path", {
				d: "M6.4209 1.68067C7.43922 1.299 8.56177 1.29898 9.58008 1.68067L14.0996 3.375C14.2946 3.44811 14.4236 3.63455 14.4238 3.84278V6.89063C14.1115 6.71853 13.7761 6.58312 13.4238 6.48926V4.18946L9.22852 2.61621C8.43657 2.31947 7.56341 2.31939 6.77148 2.61621L2.5752 4.18946V7.11914C2.5752 11.1796 5.52369 13.056 8 14.0391C8.27653 13.9293 8.55827 13.8067 8.8418 13.6729C9.07101 13.9468 9.33228 14.1929 9.62012 14.4053C9.12409 14.6579 8.63578 14.8696 8.17871 15.0449C8.0637 15.0889 7.93628 15.0889 7.82129 15.0449C5.22011 14.0472 1.5752 11.9381 1.5752 7.11914V3.84278C1.57541 3.63469 1.70463 3.44821 1.89941 3.375L6.4209 1.68067Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M5.26392 6.60339H10.7361",
				stroke: "currentColor"
			}),
			jsx("path", {
				d: "M5.26392 9.86902H8.32833",
				stroke: "currentColor"
			}),
			jsx("path", {
				d: "M10.0317 13.2229C10.263 13.3929 10.4943 13.563 10.7256 13.733C10.7932 13.6482 10.8608 13.5634 10.9284 13.4786C12.1455 11.9522 13.3626 10.4258 14.5798 8.89935C14.6474 8.81455 14.715 8.72975 14.7826 8.64495C14.4143 8.37419 14.046 8.10344 13.6777 7.83268C13.6169 7.92252 13.5562 8.01236 13.4954 8.10219C12.4016 9.71926 11.3078 11.3363 10.214 12.9534C10.1532 13.0432 10.0924 13.1331 10.0317 13.2229Z",
				fill: "currentColor"
			}),
			jsx("path", {
				d: "M12.6516 12.6696C12.6516 12.925 12.6516 13.1804 12.6516 13.4359C12.6952 13.4378 12.7387 13.4398 12.7823 13.4417C13.5663 13.4768 14.3504 13.5118 15.1345 13.5469C15.178 13.5488 15.2216 13.5508 15.2651 13.5527C15.2651 13.2194 15.2651 12.8861 15.2651 12.5527C15.2216 12.5547 15.178 12.5566 15.1345 12.5586C14.3504 12.5936 13.5663 12.6287 12.7823 12.6637C12.7387 12.6657 12.6952 12.6676 12.6516 12.6696Z",
				fill: "currentColor"
			})
		]
	});
}
function FullAccessArtwork({ size = 16, className, strokeWidth }) {
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 16 16",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": "true",
		strokeWidth,
		children: [
			jsx("path", {
				d: "M6.59624 2.14853C7.50155 1.80917 8.49914 1.80919 9.40444 2.14859L13.9245 3.84317V7.11961C13.9245 11.6089 10.5565 13.5975 8.00035 14.5779C5.44423 13.5975 2.07544 11.6089 2.07544 7.11961V3.84317L6.59624 2.14853Z",
				stroke: "currentColor",
				strokeLinejoin: "round"
			}),
			jsx("path", {
				d: "M8 4.39209V9.89209",
				stroke: "currentColor"
			}),
			jsx("path", {
				d: "M8 10.8081V11.8081",
				stroke: "currentColor"
			})
		]
	});
}
/**
* Render the read-only permission icon with a one-pixel stroke.
* @param props - Size and optional class.
* @returns The regular decorative permission glyph.
*/
function PermissionIconReadOnlyRegular(props) {
	return jsx(ReadOnlyArtwork, {
		...props,
		strokeWidth: 1
	});
}
/**
* Render the read-only permission icon with a 1.3px stroke.
* @param props - Size and optional class.
* @returns The medium decorative permission glyph.
*/
function PermissionIconReadOnlyMedium(props) {
	return jsx(ReadOnlyArtwork, {
		...props,
		strokeWidth: ICON_MEDIUM_STROKE
	});
}
/**
* Render the workspace-write permission icon with a one-pixel stroke.
* @param props - Size and optional class.
* @returns The regular decorative permission glyph.
*/
function PermissionIconWorkspaceWriteRegular(props) {
	return jsx(WorkspaceWriteArtwork, {
		...props,
		strokeWidth: 1
	});
}
/**
* Render the workspace-write permission icon with a 1.3px stroke.
* @param props - Size and optional class.
* @returns The medium decorative permission glyph.
*/
function PermissionIconWorkspaceWriteMedium(props) {
	return jsx(WorkspaceWriteArtwork, {
		...props,
		strokeWidth: ICON_MEDIUM_STROKE
	});
}
/**
* Render the full-access permission icon with a one-pixel stroke.
* @param props - Size and optional class.
* @returns The regular decorative permission glyph.
*/
function PermissionIconFullAccessRegular(props) {
	return jsx(FullAccessArtwork, {
		...props,
		strokeWidth: 1
	});
}
/**
* Render the full-access permission icon with a 1.3px stroke.
* @param props - Size and optional class.
* @returns The medium decorative permission glyph.
*/
function PermissionIconFullAccessMedium(props) {
	return jsx(FullAccessArtwork, {
		...props,
		strokeWidth: ICON_MEDIUM_STROKE
	});
}
//#endregion
//#region lib/types/ReferenceIcon.js
/**
* Render the icon that identifies one inline reference domain.
* @param props - Reference kind, optional size, and optional CSS class.
* @returns The corresponding decorative current-color SVG glyph.
*/
function ReferenceIconArtwork({ kind, size = 16, className, strokeWidth }) {
	switch (kind) {
		case "session": return jsx(ChatLinesOutlineArtwork, {
			size,
			className,
			strokeWidth
		});
		case "file": return jsx(BrowseOutlineArtwork, {
			size,
			className,
			strokeWidth
		});
		case "folder": return jsx(FolderCloseArtwork, {
			size,
			className,
			strokeWidth
		});
	}
}
/**
* Render a regular one-pixel reference icon.
* @param props - Reference kind, size, and optional class.
* @returns The regular decorative reference glyph.
*/
function ReferenceIconRegular(props) {
	return jsx(ReferenceIconArtwork, {
		...props,
		strokeWidth: 1
	});
}
/**
* Render a medium 1.3px reference icon.
* @param props - Reference kind, size, and optional class.
* @returns The medium decorative reference glyph.
*/
function ReferenceIconMedium(props) {
	return jsx(ReferenceIconArtwork, {
		...props,
		strokeWidth: ICON_MEDIUM_STROKE
	});
}
//#endregion
//#region lib/types/code-file-icon-artwork.js
/** Placeholder replaced with one React-instance id before SVG insertion. */
const CODE_FILE_ICON_ID_TOKEN = "__DSH_CODE_ICON_INSTANCE__";
/** Validated inner SVG markup for the established detailed code categories. */
const CODE_FILE_ARTWORK = Object.freeze({
	"angular": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F8ECEF\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#DD0031\" d=\"M16.712 17.711H7.288l-1.204 2.916L12 24l5.916-3.373-1.204-2.916ZM14.692 0l7.832 16.855.814-12.856L14.692 0ZM9.308 0 .662 3.999l.814 12.856L9.308 0Zm-.405 13.93h6.198L12 6.396 8.903 13.93Z\"/></g>",
	"c": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EEF4F8\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#659AD2\" d=\"M16.5921 9.1962s-.354-3.298-3.627-3.39c-3.2741-.09-4.9552 2.474-4.9552 6.14 0 3.6651 1.858 6.5972 5.0451 6.5972 3.184 0 3.5381-3.665 3.5381-3.665l6.1041.365s.36 3.31-2.196 5.836c-2.552 2.5241-5.6901 2.9371-7.8762 2.9201-2.19-.017-5.2261.034-8.1602-2.97-2.938-3.0101-3.436-5.9302-3.436-8.8002 0-2.8701.556-6.6702 4.047-9.5502C7.444.72 9.849 0 12.254 0c10.0422 0 10.7172 9.2602 10.7172 9.2602z\"/></g>",
	"clojure": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F1F7EC\" stroke=\"#DCEAD2\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><g fill=\"none\"><path d=\"M64 0C28.712 0 0 28.6 0 63.751c0 35.155 28.712 63.753 64 63.753s64-28.598 64-63.753C128 28.6 99.288 0 64 0\" fill=\"#FFF\"/><path d=\"M61.659 64.898a265.825 265.825 0 00-1.867 4.12c-2.322 5.241-4.894 11.62-5.834 15.706-.337 1.455-.546 3.258-.542 5.258 0 .79.043 1.622.11 2.469a30.74 30.74 0 0010.533 1.87 30.796 30.796 0 009.642-1.566 18.09 18.09 0 01-2.011-2.12c-4.11-5.221-6.403-12.872-10.031-25.737M46.485 38.96c-7.85 5.51-12.986 14.6-13.005 24.9.019 10.145 5.001 19.116 12.653 24.65 1.877-7.789 6.582-14.92 13.637-29.214a114.691 114.691 0 00-1.43-3.72c-1.955-4.884-4.776-10.556-7.294-13.124-1.283-1.342-2.84-2.502-4.561-3.492\" fill=\"#91DC47\"/><path d=\"M90.697 98.798c-4.05-.506-7.392-1.116-10.317-2.144a36.708 36.708 0 01-16.32 3.807c-20.293 0-36.742-16.383-36.745-36.602 0-10.97 4.852-20.805 12.528-27.512-2.053-.495-4.194-.783-6.38-.779-10.782.101-22.162 6.044-26.9 22.095-.443 2.337-.337 4.103-.337 6.197 0 31.818 25.895 57.613 57.835 57.613 19.561 0 36.841-9.682 47.305-24.489-5.66 1.405-11.103 2.077-15.763 2.091-1.747 0-3.387-.093-4.906-.277\" fill=\"#63B132\"/><path d=\"M79.829 87.634c.357.176 1.167.464 2.293.783 7.579-5.542 12.504-14.469 12.523-24.558h-.003c-.028-16.82-13.693-30.43-30.582-30.462a30.765 30.765 0 00-9.602 1.554c6.21 7.05 9.196 17.127 12.084 28.148l.005.013c.005.009.924 3.06 2.501 7.11 1.566 4.042 3.797 9.048 6.23 12.696 1.597 2.444 3.354 4.2 4.551 4.716\" fill=\"#90B4FE\"/><path d=\"M17.057 30.311c5.463-3.408 11.04-4.637 15.908-4.593 6.722.02 12.008 2.096 14.544 3.516.612.352 1.194.73 1.764 1.12a36.714 36.714 0 0114.786-3.096c20.295.003 36.747 16.386 36.75 36.601-.003 10.192-4.188 19.408-10.934 26.044a45.3 45.3 0 005.225.29c6.406.004 13.329-1.404 18.52-5.753 3.384-2.84 6.22-6.998 7.792-13.233.307-2.408.484-4.856.484-7.347 0-31.817-25.892-57.614-57.835-57.614-19.372 0-36.508 9.5-47.004 24.065z\" fill=\"#5881D8\"/></g></svg>",
	"cmake": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F2F5F7\" stroke=\"#D9E1E7\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#064F8C\" d=\"M62.8.4L.3 123.8l68.1-57.9z\"/><path fill=\"#249847\" d=\"M123.8 127.7l-84-33.9L0 127.7z\"/><path fill=\"#BE2128\" d=\"M128 126.6L65.6 2.5l9.2 102.6z\"/><path fill=\"#CDCDCE\" d=\"M71.9 104l-3.1-34.9L42 92z\"/></svg>",
	"cpp": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#E8F2F8\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#00599C\" d=\"M22.394 6c-.167-.29-.398-.543-.652-.69L12.926.22c-.509-.294-1.34-.294-1.848 0L2.26 5.31c-.508.293-.923 1.013-.923 1.6v10.18c0 .294.104.62.271.91.167.29.398.543.652.69l8.816 5.09c.508.293 1.34.293 1.848 0l8.816-5.09c.254-.147.485-.4.652-.69.167-.29.27-.616.27-.91V6.91c.003-.294-.1-.62-.268-.91zM12 19.11c-3.92 0-7.109-3.19-7.109-7.11 0-3.92 3.19-7.11 7.11-7.11a7.133 7.133 0 016.156 3.553l-3.076 1.78a3.567 3.567 0 00-3.08-1.78A3.56 3.56 0 008.444 12 3.56 3.56 0 0012 15.555a3.57 3.57 0 003.08-1.778l3.078 1.78A7.135 7.135 0 0112 19.11zm7.11-6.715h-.79v.79h-.79v-.79h-.79v-.79h.79v-.79h.79v.79h.79zm2.962 0h-.79v.79h-.79v-.79h-.79v-.79h.79v-.79h.79v.79h.79z\"/></g>",
	"csharp": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F3EEF7\" stroke=\"#E2D7EA\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#9B4F96\" d=\"M115.4 30.7L67.1 2.9c-.8-.5-1.9-.7-3.1-.7-1.2 0-2.3.3-3.1.7l-48 27.9c-1.7 1-2.9 3.5-2.9 5.4v55.7c0 1.1.2 2.4 1 3.5l106.8-62c-.6-1.2-1.5-2.1-2.4-2.7z\"/><path fill=\"#68217A\" d=\"M10.7 95.3c.5.8 1.2 1.5 1.9 1.9l48.2 27.9c.8.5 1.9.7 3.1.7 1.2 0 2.3-.3 3.1-.7l48-27.9c1.7-1 2.9-3.5 2.9-5.4V36.1c0-.9-.1-1.9-.6-2.8l-106.6 62z\"/><path fill=\"#fff\" d=\"M85.3 76.1C81.1 83.5 73.1 88.5 64 88.5c-13.5 0-24.5-11-24.5-24.5s11-24.5 24.5-24.5c9.1 0 17.1 5 21.3 12.5l13-7.5c-6.8-11.9-19.6-20-34.3-20-21.8 0-39.5 17.7-39.5 39.5s17.7 39.5 39.5 39.5c14.6 0 27.4-8 34.2-19.8l-12.9-7.6zM97 66.2l.9-4.3h-4.2v-4.7h5.1L100 51h4.9l-1.2 6.1h3.8l1.2-6.1h4.8l-1.2 6.1h2.4v4.7h-3.3l-.9 4.3h4.2v4.7h-5.1l-1.2 6h-4.9l1.2-6h-3.8l-1.2 6h-4.8l1.2-6h-2.4v-4.7H97zm4.8 0h3.8l.9-4.3h-3.8l-.9 4.3z\"/></svg>",
	"css": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#1572B6\"/><text x=\"10\" y=\"12.8\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-size=\"6.2\" font-weight=\"900\" fill=\"#fff\">CSS</text>",
	"dart": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#ECF7FA\" stroke=\"#D5EAF0\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#00c4b3\" d=\"M35.2 34.9l-8.3-8.3v59.7l.1 2.8c0 1.3.2 2.8.7 4.3l65.6 23.1 16.3-7.2-74.4-74.4z\"/><path d=\"M27.7 93.4zm81.9 15.9l-16.3 7.2-65.4-23.1c1.3 4.8 4 10.1 7 13.2l21.3 21.2 47.6.1 5.8-18.6z\" fill=\"#22d3c5\"/><path fill=\"#0075c9\" d=\"M1.7 65.1C-.4 67.3.7 72 4 75.5l14.7 14.8 9.2 3.3c-.3-1.5-.7-3-.7-4.3l-.1-2.8-.2-59.8m82.7 82.6l7.2-16.4-23-65.6c-1.5-.3-3-.6-4.3-.7l-2.9-.1-59.6.1\"/><path d=\"M93.6 27.3c.2 0 .2 0 0 0 .2 0 .2 0 0 0zm16 82l17.7-5.8V54.8l-20.4-20.5c-3-3-8.3-5.8-13.2-7l23.1 65.6\" fill=\"#00a8e1\"/><path fill=\"#00c4b3\" d=\"M90.5 18.2L75.7 3.5c-3.4-3.4-8-4.4-10.4-2.3L26.9 26.6h59.5l2.9.1c1.3 0 2.8.2 4.3.7l-3.1-9.2z\"/></svg>",
	"docker": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#E8F4FC\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#2496ED\" d=\"M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z\"/></g>",
	"elixir": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F3EEF6\" stroke=\"#E3D9E8\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-a\" gradientUnits=\"userSpaceOnUse\" x1=\"835.592\" y1=\"-36.546\" x2=\"821.211\" y2=\"553.414\" gradientTransform=\"matrix(.1297 0 0 .2 -46.03 17.198)\"><stop offset=\"0\" stop-color=\"#d9d8dc\"/><stop offset=\"1\" stop-color=\"#fff\" stop-opacity=\".385\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-a)\" d=\"M64.4.5C36.7 13.9 1.9 83.4 30.9 113.9c26.8 33.5 85.4 1.3 68.4-40.5-21.5-36-35-37.9-34.9-72.9z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-b\" gradientUnits=\"userSpaceOnUse\" x1=\"942.357\" y1=\"-40.593\" x2=\"824.692\" y2=\"472.243\" gradientTransform=\"matrix(.1142 0 0 .2271 -47.053 17.229)\"><stop offset=\"0\" stop-color=\"#8d67af\" stop-opacity=\".672\"/><stop offset=\"1\" stop-color=\"#9f8daf\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-b)\" d=\"M64.4.2C36.8 13.6 1.9 82.9 31 113.5c10.7 12.4 28 16.5 37.7 9.1 26.4-18.8 7.4-53.1 10.4-78.5C68.1 33.9 64.2 11.3 64.4.2z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-c\" gradientUnits=\"userSpaceOnUse\" x1=\"924.646\" y1=\"120.513\" x2=\"924.646\" y2=\"505.851\" gradientTransform=\"matrix(.1227 0 0 .2115 -46.493 17.206)\"><stop offset=\"0\" stop-color=\"#26053d\" stop-opacity=\".762\"/><stop offset=\"1\" stop-color=\"#b7b4b4\" stop-opacity=\".278\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-c)\" d=\"M56.7 4.3c-22.3 15.9-28.2 75-24.1 94.2 8.2 48.1 75.2 28.3 69.6-16.5-6-29.2-48.8-39.2-45.5-77.7z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-d\" gradientUnits=\"userSpaceOnUse\" x1=\"428.034\" y1=\"198.448\" x2=\"607.325\" y2=\"559.255\" gradientTransform=\"matrix(.1848 0 0 .1404 -42.394 17.138)\"><stop offset=\"0\" stop-color=\"#91739f\" stop-opacity=\".46\"/><stop offset=\"1\" stop-color=\"#32054f\" stop-opacity=\".54\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-d)\" d=\"M78.8 49.8c10.4 13.4 12.7 22.6 6.8 27.9-27.7 19.4-61.3 7.4-54-37.3C22.1 63 4.5 96.8 43.3 101.6c20.8 3.6 54 2 58.9-16.1-.2-15.9-10.8-22.9-23.4-35.7z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-e\" gradientUnits=\"userSpaceOnUse\" x1=\"907.895\" y1=\"540.636\" x2=\"590.242\" y2=\"201.281\" gradientTransform=\"matrix(.1418 0 0 .1829 -45.23 17.18)\"><stop offset=\"0\" stop-color=\"#463d49\" stop-opacity=\".331\"/><stop offset=\"1\" stop-color=\"#340a50\" stop-opacity=\".821\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-e)\" d=\"M38.1 36.4c-2.9 21.2 35.1 77.9 58.3 71-17.7 35.6-56.9-21.2-64-41.7 1.5-11 2.2-16.4 5.7-29.3z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-f\" gradientUnits=\"userSpaceOnUse\" x1=\"1102.297\" y1=\"100.542\" x2=\"1008.071\" y2=\"431.648\" gradientTransform=\"matrix(.106 0 0 .2448 -47.595 17.242)\"><stop offset=\"0\" stop-color=\"#715383\" stop-opacity=\".145\"/><stop offset=\"1\" stop-color=\"#f4f4f4\" stop-opacity=\".234\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-f)\" d=\"M60.4 49.7c.8 7.9 3.9 20.5 0 28.8S38.7 102 43.6 115.3c11.4 24.8 37.1-4.4 36.9-19 1.1-11.8-6.6-38.7-1.8-52.5L76.5 41l-13.6-4c-2.2 3.2-3 7.5-2.5 12.7z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__elixir-original-g\" gradientUnits=\"userSpaceOnUse\" x1=\"1354.664\" y1=\"140.06\" x2=\"1059.233\" y2=\"84.466\" gradientTransform=\"matrix(.09173 0 0 .2828 -48.536 17.28)\"><stop offset=\"0\" stop-color=\"#a5a1a8\" stop-opacity=\".356\"/><stop offset=\"1\" stop-color=\"#370c50\" stop-opacity=\".582\"/></linearGradient><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__elixir-original-g)\" d=\"M65.3 10.8C36 27.4 48 53.4 49.3 81.6l19.1-55.4c-1.4-5.7-2.3-9.5-3.1-15.4z\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"#330A4C\" fill-opacity=\".316\" d=\"M68.3 26.1c-14.8 11.7-14.1 31.3-18.6 54 8.1-21.3 4.1-38.2 18.6-54z\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"#FFF\" d=\"M45.8 119.7c8 1.1 12.1 2.2 12.5 3 .3 4.2-11.1 1.2-12.5-3z\"/><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" fill=\"#EDEDED\" fill-opacity=\".603\" d=\"M49.8 10.8c-6.9 7.7-14.4 21.8-18.2 29.7-1 6.5-.5 15.7.6 23.5.9-18.2 7.5-39.2 17.6-53.2z\"/></svg>",
	"env": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#ECD53F\"/><text x=\"10\" y=\"12.9\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-size=\"5.7\" font-weight=\"900\" fill=\"#24292F\">.ENV</text>",
	"erlang": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FAEDF1\" stroke=\"#EED6DE\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path d=\"M20.7 103.9C11 93.5 5.2 79.2 5.3 62.1 5.2 47 10 34 18.2 24.1H1v79.7l19.7.1zm90.4 0c4.2-4.5 8-9.8 11.4-15.9l-19-9.5c-6.7 10.8-16.4 20.8-29.9 20.9-19.6-.1-27.3-16.9-27.3-38.5h73.3c.1-2.4.1-3.6 0-4.7.5-12.9-2.9-23.7-9.1-32.1H127v79.7l-15.9.1zM47.5 42.4c.8-9.8 8.5-16.3 17.6-16.4 9.1 0 15.7 6.6 15.9 16.4H47.5z\" fill=\"#A90533\"/></svg>",
	"flutter": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EEF7FD\" stroke=\"#D7EAF6\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><g fill=\"#3FB6D3\"><path d=\"M12.3 64.2L76.3 0h39.4L32.1 83.6zM76.3 128h39.4L81.6 93.9l34.1-34.8H76.3L42.2 93.5z\"/></g><path fill=\"#27AACD\" d=\"M81.6 93.9l-20-20-19.4 19.6 19.4 19.6z\"/><path fill=\"#19599A\" d=\"M115.7 128L81.6 93.9l-20 19.2L76.3 128z\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__flutter-original-a\" gradientUnits=\"userSpaceOnUse\" x1=\"59.365\" y1=\"116.36\" x2=\"86.825\" y2=\"99.399\"><stop offset=\"0\" stop-color=\"#1b4e94\"/><stop offset=\".63\" stop-color=\"#1a5497\"/><stop offset=\"1\" stop-color=\"#195a9b\"/></linearGradient><path fill=\"url(#__DSH_CODE_ICON_INSTANCE__flutter-original-a)\" d=\"M61.6 113.1l30.8-8.4-10.8-10.8z\"/></svg>",
	"git": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FFF0EC\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#F05032\" d=\"M13.09 23.549a1.54 1.54 0 0 1-2.18 0L.451 13.089a1.54 1.54 0 0 1 0-2.179l7.191-7.19 2.733 2.733a1.85 1.85 0 0 0 .964 2.326v6.66a1.849 1.849 0 1 0 1.54 0V8.957l2.508 2.508a1.85 1.85 0 1 0 1.09-1.09l-2.634-2.634a1.85 1.85 0 0 0-2.378-2.377L8.73 2.63 10.91.451a1.54 1.54 0 0 1 2.179 0l10.459 10.46a1.54 1.54 0 0 1 0 2.179z\"/></g>",
	"go": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#E7F9FC\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#00ADD8\" d=\"M1.811 10.231c-.047 0-.058-.023-.035-.059l.246-.315c.023-.035.081-.058.128-.058h4.172c.046 0 .058.035.035.07l-.199.303c-.023.036-.082.07-.117.07zM.047 11.306c-.047 0-.059-.023-.035-.058l.245-.316c.023-.035.082-.058.129-.058h5.328c.047 0 .07.035.058.07l-.093.28c-.012.047-.058.07-.105.07zm2.828 1.075c-.047 0-.059-.035-.035-.07l.163-.292c.023-.035.07-.07.117-.07h2.337c.047 0 .07.035.07.082l-.023.28c0 .047-.047.082-.082.082zm12.129-2.36c-.736.187-1.239.327-1.963.514-.176.046-.187.058-.34-.117-.174-.199-.303-.327-.548-.444-.737-.362-1.45-.257-2.115.175-.795.514-1.204 1.274-1.192 2.22.011.935.654 1.706 1.577 1.835.795.105 1.46-.175 1.987-.77.105-.13.198-.27.315-.434H10.47c-.245 0-.304-.152-.222-.35.152-.362.432-.97.596-1.274a.315.315 0 01.292-.187h4.253c-.023.316-.023.631-.07.947a4.983 4.983 0 01-.958 2.29c-.841 1.11-1.94 1.8-3.33 1.986-1.145.152-2.209-.07-3.143-.77-.865-.655-1.356-1.52-1.484-2.595-.152-1.274.222-2.419.993-3.424.83-1.086 1.928-1.776 3.272-2.02 1.098-.2 2.15-.07 3.096.571.62.41 1.063.97 1.356 1.648.07.105.023.164-.117.2m3.868 6.461c-1.064-.024-2.034-.328-2.852-1.029a3.665 3.665 0 01-1.262-2.255c-.21-1.32.152-2.489.947-3.529.853-1.122 1.881-1.706 3.272-1.95 1.192-.21 2.314-.095 3.33.595.923.63 1.496 1.484 1.648 2.605.198 1.578-.257 2.863-1.344 3.962-.771.783-1.718 1.273-2.805 1.495-.315.06-.63.07-.934.106zm2.78-4.72c-.011-.153-.011-.27-.034-.387-.21-1.157-1.274-1.81-2.384-1.554-1.087.245-1.788.935-2.045 2.033-.21.912.234 1.835 1.075 2.21.643.28 1.285.244 1.905-.07.923-.48 1.425-1.228 1.484-2.233z\"/></g>",
	"graphql": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FCEAF6\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#E10098\" d=\"M12.002 0a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm8.54 4.931a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm0 9.862a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm-8.54 4.931a2.138 2.138 0 1 0 0 4.276 2.138 2.138 0 1 0 0-4.276zm-8.542-4.93a2.138 2.138 0 1 0 0 4.276 2.138 2.138 0 1 0 0-4.277zm0-9.863a2.138 2.138 0 1 0 0 4.277 2.138 2.138 0 1 0 0-4.277zm8.542-3.378L2.953 6.777v10.448l9.049 5.224 9.047-5.224V6.777zm0 1.601 7.66 13.27H4.34zm-1.387.371L3.97 15.037V7.363zm2.774 0 6.646 3.838v7.674zM5.355 17.44h13.293l-6.646 3.836z\"/></g>",
	"haskell": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F3F0F7\" stroke=\"#E1D9EA\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#463B63\" d=\"M0 110.2L30.1 65 0 19.9h22.6L52.7 65l-30.1 45.1H0z\"/><path fill=\"#5E5187\" d=\"M30.1 110.2L60.2 65 30.1 19.9h22.6l60.2 90.3H90.4L71.5 81.9l-18.8 28.2H30.1z\"/><path fill=\"#904F8C\" d=\"M102.9 83.8l-10-15.1H128v15.1h-25.1zM87.8 61.3l-10-15.1H128v15.1H87.8z\"/></svg>",
	"ini": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#6E7781\"/><text x=\"10\" y=\"13.2\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-size=\"7.2\" font-weight=\"800\" fill=\"#fff\">INI</text>",
	"java": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F4F7FA\" stroke=\"#D9E2E8\" stroke-width=\".5\"/><svg x=\"2.5\" y=\"2.5\" width=\"15\" height=\"15\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#0074BD\" d=\"M47.617 98.12s-4.767 2.774 3.397 3.71c9.892 1.13 14.947.968 25.845-1.092 0 0 2.871 1.795 6.873 3.351-24.439 10.47-55.308-.607-36.115-5.969zm-2.988-13.665s-5.348 3.959 2.823 4.805c10.567 1.091 18.91 1.18 33.354-1.6 0 0 1.993 2.025 5.132 3.131-29.542 8.64-62.446.68-41.309-6.336z\"/><path fill=\"#EA2D2E\" d=\"M69.802 61.271c6.025 6.935-1.58 13.17-1.58 13.17s15.289-7.891 8.269-17.777c-6.559-9.215-11.587-13.792 15.635-29.58 0 .001-42.731 10.67-22.324 34.187z\"/><path fill=\"#0074BD\" d=\"M102.123 108.229s3.529 2.91-3.888 5.159c-14.102 4.272-58.706 5.56-71.094.171-4.451-1.938 3.899-4.625 6.526-5.192 2.739-.593 4.303-.485 4.303-.485-4.953-3.487-32.013 6.85-13.743 9.815 49.821 8.076 90.817-3.637 77.896-9.468zM49.912 70.294s-22.686 5.389-8.033 7.348c6.188.828 18.518.638 30.011-.326 9.39-.789 18.813-2.474 18.813-2.474s-3.308 1.419-5.704 3.053c-23.042 6.061-67.544 3.238-54.731-2.958 10.832-5.239 19.644-4.643 19.644-4.643zm40.697 22.747c23.421-12.167 12.591-23.86 5.032-22.285-1.848.385-2.677.72-2.677.72s.688-1.079 2-1.543c14.953-5.255 26.451 15.503-4.823 23.725 0-.002.359-.327.468-.617z\"/><path fill=\"#EA2D2E\" d=\"M76.491 1.587S89.459 14.563 64.188 34.51c-20.266 16.006-4.621 25.13-.007 35.559-11.831-10.673-20.509-20.07-14.688-28.815C58.041 28.42 81.722 22.195 76.491 1.587z\"/><path fill=\"#0074BD\" d=\"M52.214 126.021c22.476 1.437 57-.8 57.817-11.436 0 0-1.571 4.032-18.577 7.231-19.186 3.612-42.854 3.191-56.887.874 0 .001 2.875 2.381 17.647 3.331z\"/></svg>",
	"javascript": "<defs><clipPath id=\"__DSH_CODE_ICON_INSTANCE__a\"><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\"/></clipPath></defs><g clip-path=\"url(#__DSH_CODE_ICON_INSTANCE__a)\"><svg x=\"1\" y=\"1\" width=\"18\" height=\"18\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#F0DB4F\" d=\"M1.408 1.408h125.184v125.185H1.408z\"/><path fill=\"#323330\" d=\"M116.347 96.736c-.917-5.711-4.641-10.508-15.672-14.981-3.832-1.761-8.104-3.022-9.377-5.926-.452-1.69-.512-2.642-.226-3.665.821-3.32 4.784-4.355 7.925-3.403 2.023.678 3.938 2.237 5.093 4.724 5.402-3.498 5.391-3.475 9.163-5.879-1.381-2.141-2.118-3.129-3.022-4.045-3.249-3.629-7.676-5.498-14.756-5.355l-3.688.477c-3.534.893-6.902 2.748-8.877 5.235-5.926 6.724-4.236 18.492 2.975 23.335 7.104 5.332 17.54 6.545 18.873 11.531 1.297 6.104-4.486 8.08-10.234 7.378-4.236-.881-6.592-3.034-9.139-6.949-4.688 2.713-4.688 2.713-9.508 5.485 1.143 2.499 2.344 3.63 4.26 5.795 9.068 9.198 31.76 8.746 35.83-5.176.165-.478 1.261-3.666.38-8.581zM69.462 58.943H57.753l-.048 30.272c0 6.438.333 12.34-.714 14.149-1.713 3.558-6.152 3.117-8.175 2.427-2.059-1.012-3.106-2.451-4.319-4.485-.333-.584-.583-1.036-.667-1.071l-9.52 5.83c1.583 3.249 3.915 6.069 6.902 7.901 4.462 2.678 10.459 3.499 16.731 2.059 4.082-1.189 7.604-3.652 9.448-7.401 2.666-4.915 2.094-10.864 2.07-17.444.06-10.735.001-21.468.001-32.237z\"/></svg></g>",
	"json": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F4F4F4\" stroke=\"#DDDDDD\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__a\" x1=\"-670.564\" x2=\"-583.105\" y1=\"-280.831\" y2=\"-368.306\" gradientTransform=\"matrix(.9988 0 0 -.9987 689.011 -259.008)\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\"/><stop offset=\"1\" stop-color=\"#fff\"/></linearGradient><path fill=\"url(#__DSH_CODE_ICON_INSTANCE__a)\" fill-rule=\"evenodd\" d=\"M63.895 94.303c27.433 37.398 54.281-10.438 54.241-39.205-.046-34.012-34.518-53.021-54.263-53.021C32.182 2.077 2 28.269 2 64.105 2 103.937 36.596 126 63.873 126c-6.172-.889-26.742-5.296-27.019-52.674-.186-32.044 10.453-44.846 26.974-39.214.37.137 18.223 7.18 18.223 30.187 0 22.908-18.156 30.004-18.156 30.004z\" clip-rule=\"evenodd\"/><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__b\" x1=\"-579.148\" x2=\"-666.607\" y1=\"-364.34\" y2=\"-276.873\" gradientTransform=\"matrix(.9988 0 0 -.9987 689.011 -259.008)\" gradientUnits=\"userSpaceOnUse\"><stop offset=\"0\"/><stop offset=\"1\" stop-color=\"#fff\"/></linearGradient><path fill=\"url(#__DSH_CODE_ICON_INSTANCE__b)\" fill-rule=\"evenodd\" d=\"M63.863 34.086C45.736 27.838 23.53 42.778 23.53 72.703 23.53 121.565 59.739 126 64.128 126 95.818 126 126 99.808 126 63.972 126 24.14 91.404 2.077 64.127 2.077c7.555-1.046 40.719 8.176 40.719 53.504 0 29.559-24.764 45.651-40.87 38.776-.37-.137-18.223-7.18-18.223-30.187 0-22.91 18.11-30.085 18.11-30.084z\" clip-rule=\"evenodd\"/></svg>",
	"kotlin": "<defs><linearGradient id=\"__DSH_CODE_ICON_INSTANCE__k\" x1=\"1\" y1=\"19\" x2=\"19\" y2=\"1\"><stop stop-color=\"#0095D5\"/><stop offset=\".5\" stop-color=\"#7F52FF\"/><stop offset=\"1\" stop-color=\"#F88909\"/></linearGradient></defs><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"url(#__DSH_CODE_ICON_INSTANCE__k)\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#FFFFFF\" d=\"M24 24H0V0h24L12 12Z\"/></g>",
	"lua": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#ECECF7\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#000080\" d=\"M.38 10.377l-.272-.037c-.048.344-.082.695-.101 1.041l.275.016c.018-.34.051-.682.098-1.02zM4.136 3.289l-.184-.205c-.258.232-.509.48-.746.734l.202.188c.231-.248.476-.49.728-.717zM5.769 2.059l-.146-.235c-.296.186-.586.385-.863.594l.166.219c.27-.203.554-.399.843-.578zM1.824 18.369c.185.297.384.586.593.863l.22-.164c-.205-.271-.399-.555-.58-.844l-.233.145zM1.127 16.402l-.255.104c.129.318.274.635.431.943l.005.01.245-.125-.005-.01c-.153-.301-.295-.611-.421-.922zM.298 9.309l.269.063c.076-.332.168-.664.272-.986l-.261-.087c-.108.332-.202.672-.28 1.01zM.274 12.42l-.275.01c.012.348.04.699.083 1.043l.273-.033c-.042-.336-.069-.68-.081-1.02zM.256 14.506c.073.34.162.682.264 1.014l.263-.08c-.1-.326-.187-.658-.258-.99l-.269.056zM11.573.275L11.563 0c-.348.012-.699.039-1.044.082l.034.273c.338-.041.68-.068 1.02-.08zM23.221 8.566c.1.326.186.66.256.992l.27-.059c-.072-.34-.16-.682-.262-1.014l-.264.081zM17.621 1.389c-.309-.164-.627-.314-.947-.449l-.107.252c.314.133.625.281.926.439l.128-.242zM15.693.572c-.332-.105-.67-.199-1.01-.277l-.063.268c.332.076.664.168.988.273l.085-.264zM6.674 1.545c.298-.15.606-.291.916-.418L7.486.873c-.317.127-.632.272-.937.428l-.015.008.125.244.015-.008zM23.727 11.588l.275-.01a11.797 11.797 0 0 0-.082-1.045l-.273.033c.041.338.068.682.08 1.022zM13.654.105c-.346-.047-.696-.08-1.043-.098l-.014.273c.339.018.683.051 1.019.098l.038-.273zM9.544.527l-.058-.27c-.34.072-.681.16-1.014.264l.081.262c.325-.099.659-.185.991-.256zM1.921 5.469l.231.15c.185-.285.384-.566.592-.834l-.217-.17c-.213.276-.417.563-.606.854zM.943 7.318l.253.107c.132-.313.28-.625.439-.924l-.243-.128c-.163.307-.314.625-.449.945zM18.223 21.943l.145.234c.295-.186.586-.385.863-.594l-.164-.219c-.272.204-.557.4-.844.579zM21.248 19.219l.217.17c.215-.273.418-.561.607-.854l-.23-.148c-.186.285-.385.564-.594.832zM19.855 20.715l.184.203c.258-.23.51-.479.746-.732l-.201-.188c-.23.248-.477.488-.729.717zM22.359 17.504l.244.129c.162-.307.314-.625.449-.945l-.254-.107a11.27 11.27 0 0 1-.439.923zM23.617 13.629l.273.039c.049-.346.082-.695.102-1.043l-.275-.014c-.018.338-.051.682-.1 1.018zM23.156 15.621l.264.086c.107-.332.201-.67.279-1.01l-.268-.063c-.077.333-.169.665-.275.987zM22.453 6.672c.154.303.297.617.424.932l.256-.104c-.131-.322-.277-.643-.436-.953l-.244.125zM8.296 23.418c.331.107.67.201 1.009.279l.062-.268c-.331-.076-.663-.168-.986-.273l-.085.262zM10.335 23.889c.345.049.696.082 1.043.102l.014-.275c-.339-.018-.682-.051-1.019-.098l-.038.271zM17.326 22.449c-.303.154-.613.297-.926.424l.104.256c.318-.131.639-.275.947-.434l.004-.002-.123-.246-.006.002zM4.613 21.467c.274.213.562.418.854.605l.149-.23c-.285-.184-.565-.385-.833-.592l-.17.217zM12.417 23.725l.009.275c.348-.014.699-.041 1.045-.084l-.035-.271c-.336.041-.68.068-1.019.08zM6.37 22.604c.307.162.625.314.946.449l.107-.254c-.313-.133-.624-.279-.924-.439l-.129.244zM3.083 20.041c.233.258.48.51.734.746l.188-.201c-.249-.23-.49-.477-.717-.729l-.205.184zM14.445 23.475l.059.27c.34-.074.68-.162 1.014-.266l-.082-.262c-.325.099-.659.185-.991.258zM21.18.129A2.689 2.689 0 1 0 21.18 5.507 2.689 2.689 0 1 0 21.18.129zM15.324 15.447c0 .471.314.66.852.66.67 0 1.297-.396 1.297-1.016v-.645c-.23.107-.379.141-1.107.24-.735.109-1.042.306-1.042.761zM12 2.818c-5.07 0-9.18 4.109-9.18 9.18 0 5.068 4.11 9.18 9.18 9.18 5.07 0 9.18-4.111 9.18-9.18 0-5.07-4.11-9.18-9.18-9.18zm-2.487 13.77H5.771v-6.023h.769v5.346h2.974v.677zm4.13 0h-.619v-.67c-.405.57-.811.793-1.446.793-.843 0-1.38-.463-1.38-1.182v-3.271h.686v3c0 .52.347.85.893.85.719 0 1.181-.578 1.181-1.461v-2.389h.686v4.33zm-.53-8.393c0-1.484 1.205-2.689 2.689-2.689s2.688 1.205 2.688 2.689-1.203 2.688-2.688 2.688-2.689-1.203-2.689-2.688zm5.567 7.856v.52c-.223.059-.33.074-.471.074-.34 0-.637-.238-.711-.57-.381.406-.918.637-1.471.637-.877 0-1.422-.463-1.422-1.248 0-.527.256-.916.76-1.123.266-.107.414-.141 1.389-.264.545-.066.719-.191.719-.48v-.182c0-.412-.348-.645-.967-.645-.645 0-.957.24-1.016.77h-.693c.041-1 .686-1.404 1.734-1.404 1.066 0 1.627.412 1.627 1.182v2.412c0 .215.133.338.373.338.041-.002.074-.002.149-.017z\"/></g>",
	"makefile": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#427819\"/><path fill=\"#fff\" d=\"m5 4.5 2.3 2.3 2.3-2.3L11 5.9 8.7 8.2l2.4 2.4L9.7 12l-2.4-2.4L5 11.9 3.6 10.5l2.3-2.3-2.3-2.3zm7 6.5h4v1.5h-4zm0 2.8h4v1.5h-4z\"/>",
	"node": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EDF7EA\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#539E43\" d=\"M11.998,24c-0.321,0-0.641-0.084-0.922-0.247l-2.936-1.737c-0.438-0.245-0.224-0.332-0.08-0.383 c0.585-0.203,0.703-0.25,1.328-0.604c0.065-0.037,0.151-0.023,0.218,0.017l2.256,1.339c0.082,0.045,0.197,0.045,0.272,0l8.795-5.076 c0.082-0.047,0.134-0.141,0.134-0.238V6.921c0-0.099-0.053-0.192-0.137-0.242l-8.791-5.072c-0.081-0.047-0.189-0.047-0.271,0 L3.075,6.68C2.99,6.729,2.936,6.825,2.936,6.921v10.15c0,0.097,0.054,0.189,0.139,0.235l2.409,1.392 c1.307,0.654,2.108-0.116,2.108-0.89V7.787c0-0.142,0.114-0.253,0.256-0.253h1.115c0.139,0,0.255,0.112,0.255,0.253v10.021 c0,1.745-0.95,2.745-2.604,2.745c-0.508,0-0.909,0-2.026-0.551L2.28,18.675c-0.57-0.329-0.922-0.945-0.922-1.604V6.921 c0-0.659,0.353-1.275,0.922-1.603l8.795-5.082c0.557-0.315,1.296-0.315,1.848,0l8.794,5.082c0.57,0.329,0.924,0.944,0.924,1.603 v10.15c0,0.659-0.354,1.273-0.924,1.604l-8.794,5.078C12.643,23.916,12.324,24,11.998,24z M19.099,13.993 c0-1.9-1.284-2.406-3.987-2.763c-2.731-0.361-3.009-0.548-3.009-1.187c0-0.528,0.235-1.233,2.258-1.233 c1.807,0,2.473,0.389,2.747,1.607c0.024,0.115,0.129,0.199,0.247,0.199h1.141c0.071,0,0.138-0.031,0.186-0.081 c0.048-0.054,0.074-0.123,0.067-0.196c-0.177-2.098-1.571-3.076-4.388-3.076c-2.508,0-4.004,1.058-4.004,2.833 c0,1.925,1.488,2.457,3.895,2.695c2.88,0.282,3.103,0.703,3.103,1.269c0,0.983-0.789,1.402-2.642,1.402 c-2.327,0-2.839-0.584-3.011-1.742c-0.02-0.124-0.126-0.215-0.253-0.215h-1.137c-0.141,0-0.254,0.112-0.254,0.253 c0,1.482,0.806,3.248,4.655,3.248C17.501,17.007,19.099,15.91,19.099,13.993z\"/></g>",
	"objective-c": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#438EFF\"/><text x=\"10\" y=\"13.2\" text-anchor=\"middle\" font-family=\"Arial,sans-serif\" font-size=\"7.2\" font-weight=\"800\" fill=\"#fff\">OC</text>",
	"perl": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EAF2F7\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#0073A1\" d=\"M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0m.157 1.103a10.91 10.91 0 0 1 9.214 5.404c-1.962.152-3.156 1.698-5.132 3.553-2.81 2.637-4.562.582-5.288-.898-.447-1.004-.847-2.117-1.544-2.769A.4.4 0 0 1 9.3 6.02l.08-.37a.083.083 0 0 0-.074-.1c-.33-.022-.601.093-.84.368a2.5 2.5 0 0 0-.375-.064c-.863-.093-1.036.345-1.873.345H5.81c-.758 0-1.391.361-1.7.892-.248.424-.257.884.15.93-.126.445.292.62 1.224.192 0 0 .733.421 1.749.421.549 0 .712.087.914.967.486 2.138 2.404 5.655 6.282 5.655l.118.166c.659.934.86 2.113.48 3.184-.307.867-.697 1.531-.697 1.531q.01.178.01.349c0 .81-.175 1.553-.387 2.23a10.91 10.91 0 0 1-11.989-6.342A10.91 10.91 0 0 1 7.608 2.01a10.9 10.9 0 0 1 4.55-.907M7.524 6.47c.288 0 .575.231.477.272a.4.4 0 0 1-.1.02.38.38 0 0 1-.375.327.384.384 0 0 1-.378-.326.4.4 0 0 1-.101-.02c-.098-.042.19-.273.477-.273m10.193 10.49q.05 0 .101.007.326.054.694.096.135.01.269.026a13.4 13.4 0 0 0 2.846-.007 10.9 10.9 0 0 1-2.007 2.705c-.11-.23-.547-1.19-.573-2.196q-.156-.01-.313-.026-.13-.014-.256-.022a18 18 0 0 1-.735-.102h-.003c-.032 0-.06.01-.074.035l-.003.012q-.081.265-.182.544c.428 1.084.652 2.078.652 2.078.14.22.258.432.363.64a11 11 0 0 1-2.168 1.264 11 11 0 0 1-1.205.426 13.3 13.3 0 0 1 1.055-2.531s.678-1.445 1.027-2.564v-.004a.55.55 0 0 1 .512-.38\"/></g>",
	"php": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F0EFF8\" stroke=\"#DDDCEB\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#777BB4\" d=\"M7.01 10.207h-.944l-.515 2.648h.838c.556 0 .97-.105 1.242-.314.272-.21.455-.559.55-1.049.092-.47.05-.802-.124-.995-.175-.193-.523-.29-1.047-.29zM12 5.688C5.373 5.688 0 8.514 0 12s5.373 6.313 12 6.313S24 15.486 24 12c0-3.486-5.373-6.312-12-6.312zm-3.26 7.451c-.261.25-.575.438-.917.551-.336.108-.765.164-1.285.164H5.357l-.327 1.681H3.652l1.23-6.326h2.65c.797 0 1.378.209 1.744.628.366.418.476 1.002.33 1.752a2.836 2.836 0 0 1-.305.847c-.143.255-.33.49-.561.703zm4.024.715l.543-2.799c.063-.318.039-.536-.068-.651-.107-.116-.336-.174-.687-.174H11.46l-.704 3.625H9.388l1.23-6.327h1.367l-.327 1.682h1.218c.767 0 1.295.134 1.586.401s.378.7.263 1.299l-.572 2.944h-1.389zm7.597-2.265a2.782 2.782 0 0 1-.305.847c-.143.255-.33.49-.561.703a2.44 2.44 0 0 1-.917.551c-.336.108-.765.164-1.286.164h-1.18l-.327 1.682h-1.378l1.23-6.326h2.649c.797 0 1.378.209 1.744.628.366.417.477 1.001.331 1.751zM17.766 10.207h-.943l-.516 2.648h.838c.557 0 .971-.105 1.242-.314.272-.21.455-.559.551-1.049.092-.47.049-.802-.125-.995s-.524-.29-1.047-.29z\"/></g>",
	"powershell": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#2671BE\"/><path fill=\"#fff\" fill-opacity=\".16\" d=\"M5.5 4h11l-3.5 12H2z\"/><path d=\"m6.5 6.5 3 3-4.2 3.2m4 1h4\" fill=\"none\" stroke=\"#fff\" stroke-width=\"1.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>",
	"protobuf": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#4285F4\"/><path fill=\"none\" stroke=\"#fff\" stroke-width=\"1.2\" stroke-linejoin=\"round\" d=\"m10 3.5 6 3.3v6.4l-6 3.3-6-3.3V6.8z\"/><path fill=\"#fff\" d=\"M6.5 6.5h4.4c2.3 0 3.6 1.2 3.6 3.1s-1.3 3.1-3.6 3.1H9v2H6.5zM9 8.4v2.4h1.6c.8 0 1.2-.4 1.2-1.2s-.4-1.2-1.2-1.2z\"/>",
	"python": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F2F4F7\" stroke=\"#D5DBE5\" stroke-width=\".5\"/><g transform=\"matrix(.126 0 0 .126 2.30 2.24)\"><path fill=\"#3776AB\" d=\"M 60.510156,6.3979729 C 55.926503,6.4192712 51.549217,6.8101906 47.697656,7.4917229 C 36.35144,9.4962267 34.291407,13.691825 34.291406,21.429223 L 34.291406,31.647973 L 61.103906,31.647973 L 61.103906,35.054223 L 34.291406,35.054223 L 24.228906,35.054223 C 16.436447,35.054223 9.6131468,39.73794 7.4789058,48.647973 C 5.0170858,58.860939 4.9078907,65.233996 7.4789058,75.897973 C 9.3848341,83.835825 13.936449,89.491721 21.728906,89.491723 L 30.947656,89.491723 L 30.947656,77.241723 C 30.947656,68.391821 38.6048,60.585475 47.697656,60.585473 L 74.478906,60.585473 C 81.933857,60.585473 87.885159,54.447309 87.885156,46.960473 L 87.885156,21.429223 C 87.885156,14.162884 81.755176,8.7044455 74.478906,7.4917229 C 69.872919,6.7249976 65.093809,6.3766746 60.510156,6.3979729 z M 46.010156,14.616723 C 48.779703,14.616723 51.041406,16.915369 51.041406,19.741723 C 51.041404,22.558059 48.779703,24.835473 46.010156,24.835473 C 43.23068,24.835472 40.978906,22.558058 40.978906,19.741723 C 40.978905,16.91537 43.23068,14.616723 46.010156,14.616723 z \"/><path fill=\"#FFD43B\" d=\"M 91.228906,35.054223 L 91.228906,46.960473 C 91.228906,56.191228 83.403011,63.960472 74.478906,63.960473 L 47.697656,63.960473 C 40.361823,63.960473 34.291407,70.238956 34.291406,77.585473 L 34.291406,103.11672 C 34.291406,110.38306 40.609994,114.65704 47.697656,116.74172 C 56.184987,119.23733 64.323893,119.68835 74.478906,116.74172 C 81.229061,114.78733 87.885159,110.85411 87.885156,103.11672 L 87.885156,92.897973 L 61.103906,92.897973 L 61.103906,89.491723 L 87.885156,89.491723 L 101.29141,89.491723 C 109.08387,89.491723 111.98766,84.056315 114.69765,75.897973 C 117.49698,67.499087 117.37787,59.422197 114.69765,48.647973 C 112.77187,40.890532 109.09378,35.054223 101.29141,35.054223 L 91.228906,35.054223 z M 76.166406,99.710473 C 78.945884,99.710476 81.197656,101.98789 81.197656,104.80422 C 81.197654,107.63057 78.945881,109.92922 76.166406,109.92922 C 73.396856,109.92922 71.135156,107.63057 71.135156,104.80422 C 71.135158,101.98789 73.396853,99.710473 76.166406,99.710473 z \"/></g>",
	"r": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EEF2F6\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#276DC3\" d=\"M12 2.746c-6.627 0-12 3.599-12 8.037 0 3.897 4.144 7.144 9.64 7.88V16.26c-2.924-.915-4.925-2.755-4.925-4.877 0-3.035 4.084-5.494 9.12-5.494 5.038 0 8.757 1.683 8.757 5.494 0 1.976-.999 3.379-2.662 4.272.09.066.174.128.258.216.169.149.25.363.372.544 2.128-1.45 3.44-3.437 3.44-5.631 0-4.44-5.373-8.038-12-8.038zm-2.111 4.99v13.516l4.093-.002-.002-5.291h1.1c.225 0 .321.066.549.25.272.22.715.982.715.982l2.164 4.063 4.627-.002-2.864-4.826s-.086-.193-.265-.383a2.22 2.22 0 00-.582-.416c-.422-.214-1.149-.434-1.149-.434s3.578-.264 3.578-3.826c0-3.562-3.744-3.63-3.744-3.63zm4.127 2.93l2.478.002s1.149-.062 1.149 1.127c0 1.165-1.149 1.17-1.149 1.17h-2.478zm1.754 6.119c-.494.049-1.012.079-1.54.088v1.807a16.622 16.622 0 002.37-.473l-.471-.891s-.108-.183-.248-.394c-.039-.054-.08-.098-.111-.137z\"/></g>",
	"react": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#20232A\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#61DAFB\" d=\"M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z\"/></g>",
	"ruby": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FCEDEC\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#CC342D\" d=\"M20.156.083c3.033.525 3.893 2.598 3.829 4.77L24 4.822 22.635 22.71 4.89 23.926h.016C3.433 23.864.15 23.729 0 19.139l1.645-3 2.819 6.586.503 1.172 2.805-9.144-.03.007.016-.03 9.255 2.956-1.396-5.431-.99-3.9 8.82-.569-.615-.51L16.5 2.114 20.159.073l-.003.01zM0 19.089zM5.13 5.073c3.561-3.533 8.157-5.621 9.922-3.84 1.762 1.777-.105 6.105-3.673 9.636-3.563 3.532-8.103 5.734-9.864 3.957-1.766-1.777.045-6.217 3.612-9.75l.003-.003z\"/></g>",
	"rust": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F3E6DD\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#2B2B2B\" d=\"M23.8346 11.7033l-1.0073-.6236a13.7268 13.7268 0 00-.0283-.2936l.8656-.8069a.3483.3483 0 00-.1154-.578l-1.1066-.414a8.4958 8.4958 0 00-.087-.2856l.6904-.9587a.3462.3462 0 00-.2257-.5446l-1.1663-.1894a9.3574 9.3574 0 00-.1407-.2622l.49-1.0761a.3437.3437 0 00-.0274-.3361.3486.3486 0 00-.3006-.154l-1.1845.0416a6.7444 6.7444 0 00-.1873-.2268l.2723-1.153a.3472.3472 0 00-.417-.4172l-1.1532.2724a14.0183 14.0183 0 00-.2278-.1873l.0415-1.1845a.3442.3442 0 00-.49-.328l-1.076.491c-.0872-.0476-.1742-.0952-.2623-.1407l-.1903-1.1673A.3483.3483 0 0016.256.955l-.9597.6905a8.4867 8.4867 0 00-.2855-.086l-.414-1.1066a.3483.3483 0 00-.5781-.1154l-.8069.8666a9.2936 9.2936 0 00-.2936-.0284L12.2946.1683a.3462.3462 0 00-.5892 0l-.6236 1.0073a13.7383 13.7383 0 00-.2936.0284L9.9803.3374a.3462.3462 0 00-.578.1154l-.4141 1.1065c-.0962.0274-.1903.0567-.2855.086L7.744.955a.3483.3483 0 00-.5447.2258L7.009 2.348a9.3574 9.3574 0 00-.2622.1407l-1.0762-.491a.3462.3462 0 00-.49.328l.0416 1.1845a7.9826 7.9826 0 00-.2278.1873L3.8413 3.425a.3472.3472 0 00-.4171.4171l.2713 1.1531c-.0628.075-.1255.1509-.1863.2268l-1.1845-.0415a.3462.3462 0 00-.328.49l.491 1.0761a9.167 9.167 0 00-.1407.2622l-1.1662.1894a.3483.3483 0 00-.2258.5446l.6904.9587a13.303 13.303 0 00-.087.2855l-1.1065.414a.3483.3483 0 00-.1155.5781l.8656.807a9.2936 9.2936 0 00-.0283.2935l-1.0073.6236a.3442.3442 0 000 .5892l1.0073.6236c.008.0982.0182.1964.0283.2936l-.8656.8079a.3462.3462 0 00.1155.578l1.1065.4141c.0273.0962.0567.1914.087.2855l-.6904.9587a.3452.3452 0 00.2268.5447l1.1662.1893c.0456.088.0922.1751.1408.2622l-.491 1.0762a.3462.3462 0 00.328.49l1.1834-.0415c.0618.0769.1235.1528.1873.2277l-.2713 1.1541a.3462.3462 0 00.4171.4161l1.153-.2713c.075.0638.151.1255.2279.1863l-.0415 1.1845a.3442.3442 0 00.49.327l1.0761-.49c.087.0486.1741.0951.2622.1407l.1903 1.1662a.3483.3483 0 00.5447.2268l.9587-.6904a9.299 9.299 0 00.2855.087l.414 1.1066a.3452.3452 0 00.5781.1154l.8079-.8656c.0972.0111.1954.0203.2936.0294l.6236 1.0073a.3472.3472 0 00.5892 0l.6236-1.0073c.0982-.0091.1964-.0183.2936-.0294l.8069.8656a.3483.3483 0 00.578-.1154l.4141-1.1066a8.4626 8.4626 0 00.2855-.087l.9587.6904a.3452.3452 0 00.5447-.2268l.1903-1.1662c.088-.0456.1751-.0931.2622-.1407l1.0762.49a.3472.3472 0 00.49-.327l-.0415-1.1845a6.7267 6.7267 0 00.2267-.1863l1.1531.2713a.3472.3472 0 00.4171-.416l-.2713-1.1542c.0628-.0749.1255-.1508.1863-.2278l1.1845.0415a.3442.3442 0 00.328-.49l-.49-1.076c.0475-.0872.0951-.1742.1407-.2623l1.1662-.1893a.3483.3483 0 00.2258-.5447l-.6904-.9587.087-.2855 1.1066-.414a.3462.3462 0 00.1154-.5781l-.8656-.8079c.0101-.0972.0202-.1954.0283-.2936l1.0073-.6236a.3442.3442 0 000-.5892zm-6.7413 8.3551a.7138.7138 0 01.2986-1.396.714.714 0 11-.2997 1.396zm-.3422-2.3142a.649.649 0 00-.7715.5l-.3573 1.6685c-1.1035.501-2.3285.7795-3.6193.7795a8.7368 8.7368 0 01-3.6951-.814l-.3574-1.6684a.648.648 0 00-.7714-.499l-1.473.3158a8.7216 8.7216 0 01-.7613-.898h7.1676c.081 0 .1356-.0141.1356-.088v-2.536c0-.074-.0536-.0881-.1356-.0881h-2.0966v-1.6077h2.2677c.2065 0 1.1065.0587 1.394 1.2088.0901.3533.2875 1.5044.4232 1.8729.1346.413.6833 1.2381 1.2685 1.2381h3.5716a.7492.7492 0 00.1296-.0131 8.7874 8.7874 0 01-.8119.9526zM6.8369 20.024a.714.714 0 11-.2997-1.396.714.714 0 01.2997 1.396zM4.1177 8.9972a.7137.7137 0 11-1.304.5791.7137.7137 0 011.304-.579zm-.8352 1.9813l1.5347-.6824a.65.65 0 00.33-.8585l-.3158-.7147h1.2432v5.6025H3.5669a8.7753 8.7753 0 01-.2834-3.348zm6.7343-.5437V8.7836h2.9601c.153 0 1.0792.1772 1.0792.8697 0 .575-.7107.7815-1.2948.7815zm10.7574 1.4862c0 .2187-.008.4363-.0243.651h-.9c-.09 0-.1265.0586-.1265.1477v.413c0 .973-.5487 1.1846-1.0296 1.2382-.4576.0517-.9648-.1913-1.0275-.4717-.2704-1.5186-.7198-1.8436-1.4305-2.4034.8817-.5599 1.799-1.386 1.799-2.4915 0-1.1936-.819-1.9458-1.3769-2.3153-.7825-.5163-1.6491-.6195-1.883-.6195H5.4682a8.7651 8.7651 0 014.907-2.7699l1.0974 1.151a.648.648 0 00.9182.0213l1.227-1.1743a8.7753 8.7753 0 016.0044 4.2762l-.8403 1.8982a.652.652 0 00.33.8585l1.6178.7188c.0283.2875.0425.577.0425.8717zm-9.3006-9.5993a.7128.7128 0 11.984 1.0316.7137.7137 0 01-.984-1.0316zm8.3389 6.71a.7107.7107 0 01.9395-.3625.7137.7137 0 11-.9405.3635z\"/></g>",
	"scala": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FCECEB\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#DC322F\" d=\"M4.589 24c4.537 0 13.81-1.516 14.821-3v-5.729c-.957 1.408-10.284 2.912-14.821 2.912V24zM4.589 16.365c4.537 0 13.81-1.516 14.821-3V7.636c-.957 1.408-10.284 2.912-14.821 2.912v5.817zM4.589 8.729c4.537 0 13.81-1.516 14.821-3V0C18.453 1.408 9.126 2.912 4.589 2.912v5.817z\"/></g>",
	"shell": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#303642\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#7EE787\" d=\"M21.038,4.9l-7.577-4.498C13.009,0.134,12.505,0,12,0c-0.505,0-1.009,0.134-1.462,0.403L2.961,4.9 C2.057,5.437,1.5,6.429,1.5,7.503v8.995c0,1.073,0.557,2.066,1.462,2.603l7.577,4.497C10.991,23.866,11.495,24,12,24 c0.505,0,1.009-0.134,1.461-0.402l7.577-4.497c0.904-0.537,1.462-1.529,1.462-2.603V7.503C22.5,6.429,21.943,5.437,21.038,4.9z M15.17,18.946l0.013,0.646c0.001,0.078-0.05,0.167-0.111,0.198l-0.383,0.22c-0.061,0.031-0.111-0.007-0.112-0.085L14.57,19.29 c-0.328,0.136-0.66,0.169-0.872,0.084c-0.04-0.016-0.057-0.075-0.041-0.142l0.139-0.584c0.011-0.046,0.036-0.092,0.069-0.121 c0.012-0.011,0.024-0.02,0.036-0.026c0.022-0.011,0.043-0.014,0.062-0.006c0.229,0.077,0.521,0.041,0.802-0.101 c0.357-0.181,0.596-0.545,0.592-0.907c-0.003-0.328-0.181-0.465-0.613-0.468c-0.55,0.001-1.064-0.107-1.072-0.917 c-0.007-0.667,0.34-1.361,0.889-1.8l-0.007-0.652c-0.001-0.08,0.048-0.168,0.111-0.2l0.37-0.236 c0.061-0.031,0.111,0.007,0.112,0.087l0.006,0.653c0.273-0.109,0.511-0.138,0.726-0.088c0.047,0.012,0.067,0.076,0.048,0.151 l-0.144,0.578c-0.011,0.044-0.036,0.088-0.065,0.116c-0.012,0.012-0.025,0.021-0.038,0.028c-0.019,0.01-0.038,0.013-0.057,0.009 c-0.098-0.022-0.332-0.073-0.699,0.113c-0.385,0.195-0.52,0.53-0.517,0.778c0.003,0.297,0.155,0.387,0.681,0.396 c0.7,0.012,1.003,0.318,1.01,1.023C16.105,17.747,15.736,18.491,15.17,18.946z M19.143,17.859c0,0.06-0.008,0.116-0.058,0.145 l-1.916,1.164c-0.05,0.029-0.09,0.004-0.09-0.056v-0.494c0-0.06,0.037-0.093,0.087-0.122l1.887-1.129 c0.05-0.029,0.09-0.004,0.09,0.056V17.859z M20.459,6.797l-7.168,4.427c-0.894,0.523-1.553,1.109-1.553,2.187v8.833 c0,0.645,0.26,1.063,0.66,1.184c-0.131,0.023-0.264,0.039-0.398,0.039c-0.42,0-0.833-0.114-1.197-0.33L3.226,18.64 c-0.741-0.44-1.201-1.261-1.201-2.142V7.503c0-0.881,0.46-1.702,1.201-2.142l7.577-4.498c0.363-0.216,0.777-0.33,1.197-0.33 c0.419,0,0.833,0.114,1.197,0.33l7.577,4.498c0.624,0.371,1.046,1.013,1.164,1.732C21.686,6.557,21.12,6.411,20.459,6.797z\"/></g>",
	"solidity": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F0F0F0\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#363636\" d=\"M4.409 6.608L7.981.255l3.572 6.353H4.409zM8.411 0l3.569 6.348L15.552 0H8.411zm4.036 17.392l3.572 6.354 3.575-6.354h-7.147zm-.608-10.284h-7.43l3.715 6.605 3.715-6.605zm.428-.25h7.428L15.982.255l-3.715 6.603zM15.589 24l-3.569-6.349L8.448 24h7.141zm-3.856-6.858H4.306l3.712 6.603 3.715-6.603zm.428-.25h7.433l-3.718-6.605-3.715 6.605z\"/></g>",
	"sql": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#336791\"/><ellipse cx=\"10\" cy=\"5.5\" rx=\"5.8\" ry=\"2.1\" fill=\"#fff\"/><path fill=\"#fff\" fill-opacity=\".88\" d=\"M4.2 5.5v8.9c0 1.2 2.6 2.1 5.8 2.1s5.8-.9 5.8-2.1V5.5c0 1.2-2.6 2.1-5.8 2.1s-5.8-.9-5.8-2.1z\"/><path d=\"M4.2 9.2c0 1.2 2.6 2.1 5.8 2.1s5.8-.9 5.8-2.1M4.2 12.9c0 1.2 2.6 2.1 5.8 2.1s5.8-.9 5.8-2.1\" fill=\"none\" stroke=\"#336791\" stroke-opacity=\".7\" stroke-width=\".7\"/>",
	"svelte": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FFF0EB\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#FF3E00\" d=\"M10.354 21.125a4.44 4.44 0 0 1-4.765-1.767 4.109 4.109 0 0 1-.703-3.107 3.898 3.898 0 0 1 .134-.522l.105-.321.287.21a7.21 7.21 0 0 0 2.186 1.092l.208.063-.02.208a1.253 1.253 0 0 0 .226.83 1.337 1.337 0 0 0 1.435.533 1.231 1.231 0 0 0 .343-.15l5.59-3.562a1.164 1.164 0 0 0 .524-.778 1.242 1.242 0 0 0-.211-.937 1.338 1.338 0 0 0-1.435-.533 1.23 1.23 0 0 0-.343.15l-2.133 1.36a4.078 4.078 0 0 1-1.135.499 4.44 4.44 0 0 1-4.765-1.766 4.108 4.108 0 0 1-.702-3.108 3.855 3.855 0 0 1 1.742-2.582l5.589-3.563a4.072 4.072 0 0 1 1.135-.499 4.44 4.44 0 0 1 4.765 1.767 4.109 4.109 0 0 1 .703 3.107 3.943 3.943 0 0 1-.134.522l-.105.321-.286-.21a7.204 7.204 0 0 0-2.187-1.093l-.208-.063.02-.207a1.255 1.255 0 0 0-.226-.831 1.337 1.337 0 0 0-1.435-.532 1.231 1.231 0 0 0-.343.15L8.62 9.368a1.162 1.162 0 0 0-.524.778 1.24 1.24 0 0 0 .211.937 1.338 1.338 0 0 0 1.435.533 1.235 1.235 0 0 0 .344-.151l2.132-1.36a4.067 4.067 0 0 1 1.135-.498 4.44 4.44 0 0 1 4.765 1.766 4.108 4.108 0 0 1 .702 3.108 3.857 3.857 0 0 1-1.742 2.583l-5.589 3.562a4.072 4.072 0 0 1-1.135.499m10.358-17.95C18.484-.015 14.082-.96 10.9 1.068L5.31 4.63a6.412 6.412 0 0 0-2.896 4.295 6.753 6.753 0 0 0 .666 4.336 6.43 6.43 0 0 0-.96 2.396 6.833 6.833 0 0 0 1.168 5.167c2.229 3.19 6.63 4.135 9.812 2.108l5.59-3.562a6.41 6.41 0 0 0 2.896-4.295 6.756 6.756 0 0 0-.665-4.336 6.429 6.429 0 0 0 .958-2.396 6.831 6.831 0 0 0-1.167-5.168Z\"/></g>",
	"swift": "<defs><clipPath id=\"__DSH_CODE_ICON_INSTANCE__a\"><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\"/></clipPath></defs><g clip-path=\"url(#__DSH_CODE_ICON_INSTANCE__a)\"><svg x=\"1\" y=\"1\" width=\"18\" height=\"18\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#f05138\" d=\"M126.33 34.06a39.32 39.32 0 00-.79-7.83 28.78 28.78 0 00-2.65-7.58 28.84 28.84 0 00-4.76-6.32 23.42 23.42 0 00-6.62-4.55 27.27 27.27 0 00-7.68-2.53c-2.65-.51-5.56-.51-8.21-.76H30.25a45.46 45.46 0 00-6.09.51 21.82 21.82 0 00-5.82 1.52c-.53.25-1.32.51-1.85.76a33.82 33.82 0 00-5 3.28c-.53.51-1.06.76-1.59 1.26a22.41 22.41 0 00-4.76 6.32 23.61 23.61 0 00-2.65 7.58 78.5 78.5 0 00-.79 7.83v60.39a39.32 39.32 0 00.79 7.83 28.78 28.78 0 002.65 7.58 28.84 28.84 0 004.76 6.32 23.42 23.42 0 006.62 4.55 27.27 27.27 0 007.68 2.53c2.65.51 5.56.51 8.21.76h63.22a45.08 45.08 0 008.21-.76 27.27 27.27 0 007.68-2.53 30.13 30.13 0 006.62-4.55 22.41 22.41 0 004.76-6.32 23.61 23.61 0 002.65-7.58 78.49 78.49 0 00.79-7.83V34.06z\"/><path fill=\"#fefefe\" d=\"M85 96.5c-11.11 6.13-26.38 6.76-41.75.47A64.53 64.53 0 0113.84 73a50 50 0 0010.85 6.32c15.87 7.1 31.73 6.61 42.9 0-15.9-11.66-29.4-26.82-39.46-39.2a43.47 43.47 0 01-5.29-6.82c12.16 10.61 31.5 24 38.38 27.79a271.77 271.77 0 01-27-32.34 266.8 266.8 0 0044.47 34.87c.71.38 1.26.7 1.7 1a32.7 32.7 0 001.21-3.51c3.71-12.89-.53-27.54-9.79-39.67C93.25 33.81 106 57.05 100.66 76.51c-.14.53-.29 1-.45 1.55l.19.22c10.59 12.63 7.68 26 6.35 23.5C101 91 90.37 94.33 85 96.5z\"/></svg></g>",
	"toml": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#F6EEEA\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#9C4121\" d=\"M.014 0h5.34v2.652H2.888v18.681h2.468V24H.015V0Zm17.622 5.049v2.78h-4.274v12.935h-3.008V7.83H6.059V5.05h11.577ZM23.986 24h-5.34v-2.652h2.467V2.667h-2.468V0h5.34v24Z\"/></g>",
	"typescript": "<defs><clipPath id=\"__DSH_CODE_ICON_INSTANCE__a\"><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\"/></clipPath></defs><g clip-path=\"url(#__DSH_CODE_ICON_INSTANCE__a)\"><svg x=\"1\" y=\"1\" width=\"18\" height=\"18\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#fff\" d=\"M22.67 47h99.67v73.67H22.67z\"/><path data-name=\"original\" fill=\"#007acc\" d=\"M1.5 63.91v62.5h125v-125H1.5zm100.73-5a15.56 15.56 0 017.82 4.5 20.58 20.58 0 013 4c0 .16-5.4 3.81-8.69 5.85-.12.08-.6-.44-1.13-1.23a7.09 7.09 0 00-5.87-3.53c-3.79-.26-6.23 1.73-6.21 5a4.58 4.58 0 00.54 2.34c.83 1.73 2.38 2.76 7.24 4.86 8.95 3.85 12.78 6.39 15.16 10 2.66 4 3.25 10.46 1.45 15.24-2 5.2-6.9 8.73-13.83 9.9a38.32 38.32 0 01-9.52-.1 23 23 0 01-12.72-6.63c-1.15-1.27-3.39-4.58-3.25-4.82a9.34 9.34 0 011.15-.73L82 101l3.59-2.08.75 1.11a16.78 16.78 0 004.74 4.54c4 2.1 9.46 1.81 12.16-.62a5.43 5.43 0 00.69-6.92c-1-1.39-3-2.56-8.59-5-6.45-2.78-9.23-4.5-11.77-7.24a16.48 16.48 0 01-3.43-6.25 25 25 0 01-.22-8c1.33-6.23 6-10.58 12.82-11.87a31.66 31.66 0 019.49.26zm-29.34 5.24v5.12H56.66v46.23H45.15V69.26H28.88v-5a49.19 49.19 0 01.12-5.17C29.08 59 39 59 51 59h21.83z\"/></svg></g>",
	"vue": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#ECF8F3\" stroke=\"#D5EAE0\" stroke-width=\".5\"/><path fill=\"#41B883\" d=\"M3.5 5h3.2l3.3 5.7L13.3 5h3.2L10 16z\"/><path fill=\"#35495E\" d=\"M6.7 5H9l1 1.8L11 5h2.3L10 10.7z\"/>",
	"wasm": "<defs><clipPath id=\"__DSH_CODE_ICON_INSTANCE__a\"><rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\"/></clipPath></defs><g clip-path=\"url(#__DSH_CODE_ICON_INSTANCE__a)\"><svg x=\"1\" y=\"1\" width=\"18\" height=\"18\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\"><path fill=\"#654ff0\" d=\"M.223.222v127.555h127.555V.222H78.594c.014.227.036.455.036.686 0 8.08-6.55 14.626-14.63 14.626-8.078 0-14.625-6.546-14.625-14.626 0-.231.022-.459.031-.686zm29.595 68.746h8.445l5.782 30.738h.107l6.968-30.738h7.908l6.265 31.119h.106l6.597-31.119h8.284l-10.765 45.156H61.12l-6.213-30.738H54.8l-6.7 30.738h-8.557zm59.994 0h13.334l13.284 45.156h-8.77l-2.879-10.051H89.59l-2.212 10.05h-8.5ZM94.895 80.1l-3.684 16.57h11.473L98.448 80.1Z\"/></svg></g>",
	"xml": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#EAF3FA\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#005FAD\" d=\"M4.345 7.053c-.495.02-.44.725-.536 1.081-.157.583-.3 1.325-.347 1.926-.046.585-.008 1.127.066 1.719.058.46.191.767.07.89-.108.11-3.216 2.962-3.466 3.123-.26.169-.08.584.069.817.157.246.23.373.557.33.306-.042.405-.409.583-.606.228-.252 2.421-2.401 2.616-2.401.077.544.367 1.064.67 1.513.15.222.314.439.505.629.175.175.4.317.587.45.44.024.795-.301.35-.67-.17-.14-.735-.971-.927-1.43-.18-.43-.574-1.076-.146-1.428 1.494-1.23 3.72-2.262 4.247-2.313-.257 1.024-1.356 3.048-1.757 4.012-.14.333-.231.732-.185 1.094.055.434.383.774.587.806.417-.023.7-.387.946-.645.343-.357.634-.685.974-1.043.339-.356.672-.731.971-1.07.184-.207.674-.713.963-.713-.11.693-.716 1.552-.839 2.254-.125.716.531 1.596 1.217.956.623-.58 1.255-1.129 1.867-1.72.217-.208.175.037.224.242.05.208.176.91.275 1.1.18.346.496.592.897.598.362.006.727-.161.982-.414.19-.187.513-.699.154-.832-.23-.086-.217-.176-.495-.129-.172.029-.362.074-.507.179-.367-.003-.381-.89-.324-1.161.068-.327.207-.659.185-.998-.026-.418-.478-.69-.582-.72-.156-.076-.253.023-.458.212-.173.161-.363.332-.535.495-.34.322-.768.813-.942.813.305-.705.708-2.652-.643-2.48-.563.071-.95.377-1.394.71-.29.28-.683.641-.936.87-.236.216-.371.404-.496.404.132-.747 1.685-3.167.885-3.853-.158-.136-.313-.325-.515-.349a4.637 4.637 0 0 0-.833.19c-.565.18-2.78 1.28-4.19 2.289-.131.094-.214-.085-.231-.29-.087-1.058.199-2.19.496-3.188.208-.696-.557-1.225-.659-1.249zm18.177.874c-.166.364-.2.894-.248 1.319a24.307 24.307 0 0 0-1.246-.115c.238.296.691.588 1.056.724-.048.366-.434.67-.599 1.021.458-.127.676-.47.989-.821.362.22.791.627 1.26.636-.177-.376-.334-.695-.658-.966.269-.175.717-.362.924-.633-.345-.074-.718-.093-1.052-.015-.258-.284-.3-.772-.426-1.15zm-2.92.079c-.23.02-.613.49-.832.773-.807 1.039-1.542 3.15-1.661 3.542-.363 1.195-.502 2.672.28 3.722.456.612 1.258.66 2.041.434.405-.116.812-.406.95-.723.114-.263.174-.753-.404-.38-.224.145-.634.304-1.37.291-.247-.004-.651-.357-.76-.722-.192-.595-.11-1.393-.11-1.393.167-1.028.642-2.146 1.061-3.076.163-.36.658-1.259.842-1.546 0 0 .239-.373.131-.77-.031-.116-.091-.16-.168-.152zm3.072 2.976c-.12.264-.144.648-.18.956-.274-.031-.63-.066-.904-.083.172.215.501.426.766.525-.034.265-.314.486-.434.741.332-.092.49-.34.717-.596.263.16.575.456.914.462-.127-.273-.242-.504-.477-.701.195-.127.52-.262.67-.46a1.77 1.77 0 0 0-.763-.01c-.187-.206-.217-.56-.309-.834zm-1.123 2.422c-.083.183-.1.449-.125.662a12.6 12.6 0 0 0-.624-.058c.119.148.346.295.53.363-.025.184-.219.336-.301.513.23-.064.339-.236.496-.413.181.11.397.316.632.32-.088-.19-.168-.349-.33-.485.135-.087.36-.181.463-.317a1.22 1.22 0 0 0-.527-.008c-.13-.142-.151-.387-.214-.576z\"/></g>",
	"yaml": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FCEEEF\" stroke=\"#F0D8DB\" stroke-width=\".5\"/><svg x=\"2.75\" y=\"2.75\" width=\"14.5\" height=\"14.5\" viewBox=\"0 0 128 128\" preserveAspectRatio=\"xMidYMid meet\">\n<polygon transform=\"matrix(.24805 0 0 .24805 .5 5.6287)\" points=\"87.702 137.67 0 0 63.25 0 119.02 88.646 175.24 0 235.79 0 143.98 137.67 143.98 224.95 87.702 224.95\"/>\n<path d=\"m82.428 49.149h-25.266l-5.1388 12.408h-11.188l23.659-55.798h11.444l22.699 55.798h-11.956l-4.2525-12.408zm-4.197-11.14-7.7455-20.476-8.6412 20.476z\" fill=\"#cb171e\"/>\n<polygon transform=\"matrix(.24805 0 0 .24805 .5 5.6287)\" points=\"87.701 250.18 87.701 470.65 135 470.65 135 318.57 184.51 420.79 221.74 420.79 272.94 314.98 272.94 470.6 318.32 470.6 318.32 250.18 256.36 250.18 201.38 349.88 149.02 250.18\"/>\n<polygon transform=\"matrix(.24805 0 0 .24805 .5 5.6287)\" points=\"512 422.74 512 422.74 395.64 422.74 395.64 250.12 347.44 250.12 347.44 469.65 512 469.65\"/>\n</svg>",
	"zig": "<rect x=\"1\" y=\"1\" width=\"18\" height=\"18\" rx=\"4\" fill=\"#FFF4DF\" stroke=\"#DDE2E8\" stroke-width=\".5\"/><g transform=\"translate(3 3) scale(.5833333333)\"><path fill=\"#E18A00\" d=\"m23.53 1.02-7.686 3.45h-7.06l-2.98 3.452h7.173L.47 22.98l7.681-3.607h7.065v-.002l2.978-3.45-7.148-.001 12.482-14.9zM0 4.47v14.901h1.883l2.98-3.45H3.451v-8h.942l2.824-3.45H0zm22.117 0-2.98 3.608h1.412v7.844h-.942l-2.98 3.45H24V4.47h-1.883z\"/></g>"
});
//#endregion
//#region lib/types/CodeFileIcon.js
/**
* Render one full-color square code-file glyph from the embedded icon set.
* @param props - Detailed code type, optional size, and optional CSS class.
* @returns The selected decorative SVG with its identifying palette intact.
*/
function CodeFileIcon({ type, size = 20, className }) {
	const instanceId = `dsh-code-icon-${useId().replaceAll(":", "")}`;
	return jsx("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 20 20",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		dangerouslySetInnerHTML: { __html: CODE_FILE_ARTWORK[type].replaceAll(CODE_FILE_ICON_ID_TOKEN, instanceId) }
	});
}
const CODE_FILE_TYPE_SET = new Set([
	"angular",
	"c",
	"clojure",
	"cmake",
	"cpp",
	"csharp",
	"css",
	"dart",
	"docker",
	"elixir",
	"env",
	"erlang",
	"flutter",
	"git",
	"go",
	"graphql",
	"haskell",
	"ini",
	"java",
	"javascript",
	"json",
	"kotlin",
	"lua",
	"makefile",
	"node",
	"objective-c",
	"perl",
	"php",
	"powershell",
	"protobuf",
	"python",
	"r",
	"react",
	"ruby",
	"rust",
	"scala",
	"shell",
	"solidity",
	"sql",
	"svelte",
	"swift",
	"toml",
	"typescript",
	"vue",
	"wasm",
	"xml",
	"yaml",
	"zig"
]);
const FILE_NAME_TYPES = {
	".bash_profile": "shell",
	".bashrc": "shell",
	".env": "env",
	".gitattributes": "git",
	".gitconfig": "git",
	".gitignore": "git",
	".gitmodules": "git",
	".mailmap": "git",
	".profile": "shell",
	".zprofile": "shell",
	".zshrc": "shell",
	"bsdmakefile": "makefile",
	"cmakelists.txt": "cmake",
	"commit_editmsg": "git",
	"compose.yaml": "docker",
	"compose.yml": "docker",
	"docker-compose.yaml": "docker",
	"docker-compose.yml": "docker",
	"dockerfile": "docker",
	"gemfile": "ruby",
	"gnumakefile": "makefile",
	"guardfile": "ruby",
	"makefile": "makefile",
	"npm-shrinkwrap.json": "node",
	"package-lock.json": "node",
	"package.json": "node",
	"podfile": "ruby",
	"rakefile": "ruby"
};
const FILE_NAME_PREFIX_TYPES = [["dockerfile.", "docker"], [".env.", "env"]];
const FILE_NAME_SUFFIX_TYPES = [
	[".component.ts", "angular"],
	[".component.html", "angular"],
	[".directive.ts", "angular"],
	[".service.ts", "angular"],
	[".module.ts", "angular"],
	[".pipe.ts", "angular"],
	[".guard.ts", "angular"],
	[".interceptor.ts", "angular"],
	[".dockerfile", "docker"]
];
const EXTENSION_TYPES$1 = {
	"bash": "shell",
	"c": "c",
	"c++": "cpp",
	"cc": "cpp",
	"cfg": "ini",
	"cjs": "javascript",
	"clj": "clojure",
	"cljc": "clojure",
	"cljs": "clojure",
	"cmake": "cmake",
	"cpp": "cpp",
	"cs": "csharp",
	"csh": "shell",
	"css": "css",
	"csx": "csharp",
	"cts": "typescript",
	"cxx": "cpp",
	"dart": "dart",
	"dtd": "xml",
	"edn": "clojure",
	"env": "env",
	"erl": "erlang",
	"es6": "javascript",
	"escript": "erlang",
	"ex": "elixir",
	"exs": "elixir",
	"fish": "shell",
	"gemspec": "ruby",
	"go": "go",
	"gql": "graphql",
	"graphql": "graphql",
	"h": "c",
	"h++": "cpp",
	"hh": "cpp",
	"hpp": "cpp",
	"hrl": "erlang",
	"hs": "haskell",
	"hxx": "cpp",
	"ini": "ini",
	"ipp": "cpp",
	"java": "java",
	"js": "javascript",
	"json": "json",
	"json5": "json",
	"jsonc": "json",
	"jsx": "react",
	"ksh": "shell",
	"kt": "kotlin",
	"kts": "kotlin",
	"lhs": "haskell",
	"lua": "lua",
	"m": "objective-c",
	"mak": "makefile",
	"mjs": "javascript",
	"mk": "makefile",
	"mm": "objective-c",
	"mts": "typescript",
	"node": "node",
	"pch": "objective-c",
	"php": "php",
	"php3": "php",
	"php4": "php",
	"php5": "php",
	"phps": "php",
	"phtml": "php",
	"pl": "perl",
	"plist": "xml",
	"pm": "perl",
	"pod": "perl",
	"proto": "protobuf",
	"ps1": "powershell",
	"psd1": "powershell",
	"psm1": "powershell",
	"py": "python",
	"pyi": "python",
	"pyw": "python",
	"pyx": "python",
	"r": "r",
	"rake": "ruby",
	"rb": "ruby",
	"rmd": "r",
	"rs": "rust",
	"sc": "scala",
	"scala": "scala",
	"sh": "shell",
	"sol": "solidity",
	"sql": "sql",
	"svelte": "svelte",
	"swift": "swift",
	"t": "perl",
	"tcsh": "shell",
	"toml": "toml",
	"tpp": "cpp",
	"ts": "typescript",
	"tsx": "react",
	"vue": "vue",
	"wasm": "wasm",
	"wast": "wasm",
	"wat": "wasm",
	"xml": "xml",
	"xsd": "xml",
	"xsl": "xml",
	"xslt": "xml",
	"yaml": "yaml",
	"yml": "yaml",
	"zig": "zig",
	"zsh": "shell"
};
const LINK_CODE_EXTENSIONS = new Set([
	"ts",
	"tsx",
	"js",
	"jsx",
	"mjs",
	"cjs",
	"cts",
	"mts",
	"css",
	"scss",
	"sass",
	"less",
	"html",
	"htm",
	"vue",
	"svelte",
	"astro",
	"json",
	"jsonc",
	"json5",
	"yaml",
	"yml",
	"toml",
	"xml",
	"ini",
	"env",
	"sh",
	"bash",
	"zsh",
	"fish",
	"ps1",
	"bat",
	"cmd",
	"py",
	"pyi",
	"rb",
	"rs",
	"go",
	"java",
	"kt",
	"kts",
	"c",
	"cc",
	"cpp",
	"cxx",
	"h",
	"hh",
	"hpp",
	"cs",
	"php",
	"swift",
	"sql",
	"proto",
	"graphql",
	"gql",
	"lua",
	"r",
	"pl",
	"scala",
	"clj",
	"cljs",
	"ex",
	"exs",
	"erl",
	"hs",
	"dart"
]);
function basename$1(path) {
	return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}
/**
* Test whether a resolved file type uses the full-color code-icon set.
* @param type - Resolved file-type string.
* @returns Whether the value is a detailed code-file type.
*/
function isCodeFileType(type) {
	return CODE_FILE_TYPE_SET.has(type);
}
/**
* Test whether an extension belongs to the established coarse link-icon code category.
* @param extension - Extension without a leading dot.
* @returns Whether clickable links keep the code glyph for this extension.
*/
function isLinkCodeExtension(extension) {
	return LINK_CODE_EXTENSIONS.has(extension.toLowerCase());
}
/**
* Resolve the most specific code/configuration icon according to the supplied map priority.
* @param name - Lowercase basename.
* @param extension - Lowercase extension without the leading dot.
* @param context - Optional project-file snapshot for context-sensitive matches.
* @returns The detailed code type, or null when the traditional file classifier owns the path.
*/
function classifyCodeFileType(name, extension, context) {
	const exact = FILE_NAME_TYPES[name];
	if (exact !== void 0) return exact;
	for (const [prefix, type] of FILE_NAME_PREFIX_TYPES) if (name.startsWith(prefix)) return type;
	for (const [suffix, type] of FILE_NAME_SUFFIX_TYPES) if (name.endsWith(suffix)) return type;
	if (extension === "dart" && context !== void 0) {
		if ((Object.entries(context.files).find(([path]) => basename$1(path).toLowerCase() === "pubspec.yaml")?.[1])?.includes("flutter:") === true) return "flutter";
	}
	return EXTENSION_TYPES$1[extension] ?? null;
}
//#endregion
//#region lib/types/FileTypeIcon.js
const EXTENSION_TYPES = {
	scss: "code",
	sass: "code",
	less: "code",
	vue: "code",
	svelte: "code",
	astro: "code",
	bat: "code",
	cmd: "code",
	csv: "excel",
	tsv: "excel",
	html: "html",
	htm: "html",
	png: "image",
	jpg: "image",
	jpeg: "image",
	gif: "image",
	svg: "image",
	webp: "image",
	avif: "image",
	bmp: "image",
	ico: "image",
	tif: "image",
	tiff: "image",
	heic: "image",
	heif: "image",
	md: "markdown",
	mdx: "markdown",
	markdown: "markdown",
	pdf: "pdf",
	ppt: "ppt",
	pptx: "ppt",
	key: "ppt",
	mp4: "video",
	mov: "video",
	m4v: "video",
	webm: "video",
	mkv: "video",
	avi: "video",
	mpg: "video",
	mpeg: "video",
	doc: "word",
	docx: "word",
	rtf: "word",
	odt: "word",
	pages: "word",
	xls: "excel",
	xlsx: "excel",
	xlsm: "excel",
	xlsb: "excel",
	xlt: "excel",
	xltx: "excel",
	xltm: "excel",
	ods: "excel",
	ots: "excel",
	fods: "excel",
	numbers: "excel"
};
const NAME_TYPES = {
	changelog: "markdown",
	contributing: "markdown",
	readme: "markdown"
};
function basename(path) {
	return path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
}
/**
* Extract the final suffix from a file path without changing its case.
* A leading dot starts a suffix, while a missing or trailing dot returns an empty string.
* @param path - File path or basename using either path separator.
* @returns The characters after the basename's final dot.
*/
function fileExtension(path) {
	const name = basename(path);
	const dot = name.lastIndexOf(".");
	return dot < 0 ? "" : name.slice(dot + 1);
}
/**
* Classify a file path or name for file-card presentation.
* Matching is case-insensitive and applies code filename rules before extension rules;
* unknown names fall back to `other`.
* @param path - File path or basename using either path separator.
* @param context - Optional project files used by context-sensitive code mappings.
* @returns The file's closed presentation category.
*/
function classifyFileType(path, context) {
	const name = basename(path).toLowerCase();
	const extension = fileExtension(name).toLowerCase();
	return classifyCodeFileType(name, extension, context) ?? NAME_TYPES[name] ?? EXTENSION_TYPES[extension] ?? "other";
}
const FILE_BODY = "M8.48924 28H19.5108C21.6479 28 22.7165 28 23.5594 27.6509C24.6833 27.1853 25.5762 26.2924 26.0417 25.1685C26.3909 24.3256 26.3909 23.257 26.3909 21.1199V8.79443C26.3909 8.32877 26.3909 8.09593 26.3471 7.87507C26.2887 7.58058 26.173 7.30042 26.0067 7.05048C25.882 6.86303 25.7177 6.69799 25.3893 6.36792L20.0611 1.01354C19.7304 0.681235 19.5651 0.515081 19.3769 0.38885C19.126 0.220541 18.8443 0.103463 18.5481 0.0443412C18.3259 0 18.0915 0 17.6226 0H8.48924C6.35209 0 5.28351 0 4.4406 0.349145C3.31672 0.814671 2.4238 1.70759 1.95828 2.83147C1.60913 3.67438 1.60913 4.74296 1.60913 6.88011V21.1199C1.60913 23.257 1.60913 24.3256 1.95828 25.1685C2.4238 26.2924 3.31672 27.1853 4.4406 27.6509C5.28351 28 6.35209 28 8.48924 28Z";
const FILE_FOLD = "M26.3909 7.37445L19.0525 0V3.77445C19.0525 4.89271 19.0525 5.45184 19.2352 5.89289C19.4788 6.48096 19.946 6.94818 20.5341 7.19176C20.9751 7.37445 21.5342 7.37445 22.6525 7.37445H26.3909Z";
const FILE_MARK_TRANSFORM = "translate(14 16) scale(1.12) translate(-14 -16)";
const LARGE_FILE_MARK_TRANSFORM = "translate(14 16) scale(1.22) translate(-14 -16)";
const FOLDER_MARK_TRANSFORM = "translate(14 13.0693) scale(1.12) translate(-14 -13.0693)";
function FileGlyph({ size, className, children, markTransform, muted = false }) {
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 28 28",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		children: [
			jsx("path", {
				d: FILE_BODY,
				fill: "currentColor"
			}),
			muted ? jsx("path", {
				d: FILE_FOLD,
				fill: "var(--dsw-static-neutral-400)"
			}) : jsx("path", {
				d: FILE_FOLD,
				fill: "var(--dsw-static-neutral-00)",
				fillOpacity: ".7"
			}),
			children !== void 0 && jsx("g", {
				color: "var(--dsw-static-neutral-00)",
				"data-file-type-mark": true,
				transform: markTransform,
				children
			})
		]
	});
}
function FolderGlyph({ size, className }) {
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 28 28",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		children: [jsx("path", {
			d: "M2.80078 10.2112C2.80078 9.52802 2.80078 9.18642 2.85314 8.866C2.98648 8.05 3.36942 7.29538 3.94925 6.70595C4.17694 6.4745 4.45264 6.2728 5.00404 5.86939C5.29197 5.65874 5.43594 5.55342 5.58711 5.46632C5.97089 5.24521 6.39638 5.10618 6.83667 5.05803C7.01011 5.03906 7.18849 5.03906 7.54524 5.03906H11.6543C12.4669 5.03906 12.8732 5.03906 13.2599 5.13697C13.3882 5.16945 13.5143 5.20986 13.6375 5.25795C14.0091 5.40294 14.3398 5.63902 15.0012 6.1112L16.2632 7.01224C16.5526 7.21881 16.6972 7.3221 16.8598 7.38553C16.9137 7.40657 16.9689 7.42425 17.025 7.43846C17.1942 7.4813 17.372 7.4813 17.7275 7.4813H19.8008C22.0506 7.4813 23.1755 7.4813 23.9641 8.05425C24.2188 8.23928 24.4428 8.46326 24.6278 8.71794C25.2008 9.50654 25.2008 10.6315 25.2008 12.8813V18.7283C25.2008 20.9781 25.2008 22.1031 24.6278 22.8917C24.4428 23.1463 24.2188 23.3703 23.9641 23.5554C23.1755 24.1283 22.0506 24.1283 19.8008 24.1283H8.20077C5.95094 24.1283 4.82602 24.1283 4.03743 23.5554C3.78274 23.3703 3.55877 23.1463 3.37373 22.8917C2.80078 22.1031 2.80078 20.9781 2.80078 18.7283V10.2112Z",
			fill: "currentColor"
		}), jsx("g", {
			color: "var(--dsw-static-neutral-00)",
			"data-file-type-mark": true,
			transform: FOLDER_MARK_TRANSFORM,
			children: jsx("path", {
				d: "M6.31445 13.0693H21.6893",
				stroke: "currentColor",
				strokeWidth: "2.38"
			})
		})]
	});
}
function SpreadsheetGlyph({ size, className }) {
	return jsx(FileGlyph, {
		size,
		className,
		children: jsx("path", {
			d: "M14 11.5H11.4C10.5599 11.5 10.1399 11.5 9.81901 11.6635C9.53677 11.8073 9.3073 12.0368 9.16349 12.319C9 12.6399 9 13.0599 9 13.9V16.5M14 11.5H16.6C17.4401 11.5 17.8601 11.5 18.181 11.6635C18.4632 11.8073 18.6927 12.0368 18.8365 12.319C19 12.6399 19 13.0599 19 13.9V16.5M14 11.5V21.5M14 21.5H16.6C17.4401 21.5 17.8601 21.5 18.181 21.3365C18.4632 21.1927 18.6927 20.9632 18.8365 20.681C19 20.3601 19 19.9401 19 19.1V16.5M14 21.5H11.4C10.5599 21.5 10.1399 21.5 9.81901 21.3365C9.53677 21.1927 9.3073 20.9632 9.16349 20.681C9 20.3601 9 19.9401 9 19.1V16.5M19 16.5H9",
			stroke: "currentColor",
			strokeWidth: "1.2"
		})
	});
}
function glyph(type, size, className) {
	switch (type) {
		case "code": return jsxs(FileGlyph, {
			size,
			className,
			children: [
				jsx("path", {
					d: "M10.0053 13.126L7.0236 16.3788C6.96052 16.4476 6.96052 16.5532 7.0236 16.622L10.0053 19.8748",
					stroke: "currentColor",
					strokeWidth: "1.35"
				}),
				jsx("path", {
					d: "M17.9941 13.126L20.9759 16.3788C21.039 16.4476 21.039 16.5532 20.9759 16.622L17.9941 19.8748",
					stroke: "currentColor",
					strokeWidth: "1.35"
				}),
				jsx("path", {
					d: "M15.2652 12.957L12.7344 20.0433",
					stroke: "currentColor",
					strokeWidth: "1.35"
				})
			]
		});
		case "excel": return jsx(SpreadsheetGlyph, {
			size,
			className
		});
		case "folder": return jsx(FolderGlyph, {
			size,
			className
		});
		case "html": return jsx(FileGlyph, {
			size,
			className,
			markTransform: FILE_MARK_TRANSFORM,
			children: jsx("path", {
				fillRule: "evenodd",
				clipRule: "evenodd",
				d: "M13.9994 9.68298C17.212 9.68298 19.8167 12.2872 19.8168 15.4997C19.8168 18.7123 17.2121 21.3171 13.9994 21.3171C10.7869 21.3169 8.18274 18.7122 8.18274 15.4997C8.1829 12.2873 10.787 9.68315 13.9994 9.68298ZM9.26213 16.0247C9.47025 17.9241 10.7936 19.4876 12.5639 20.0463C12.42 19.7977 12.2952 19.5152 12.1879 19.2116C11.885 18.3541 11.693 17.2434 11.6424 16.0247H9.26213ZM16.3565 16.0247C16.3059 17.2434 16.1145 18.3542 15.8116 19.2116C15.7044 19.5151 15.5788 19.7971 15.435 20.0456C17.2054 19.487 18.5293 17.9242 18.7374 16.0247H16.3565ZM12.6938 16.0247C12.7439 17.1459 12.9212 18.1334 13.1784 18.8616C13.332 19.2962 13.503 19.61 13.6686 19.805C13.834 19.9996 13.9473 20.0256 13.9994 20.0258C14.0514 20.0258 14.1651 20.0002 14.331 19.805C14.4966 19.61 14.6676 19.2962 14.8211 18.8616C15.0784 18.1334 15.2557 17.1459 15.3058 16.0247H12.6938ZM13.9994 10.733C13.9473 10.7331 13.834 10.7598 13.6686 10.9545C13.503 11.1494 13.3319 11.4633 13.1784 11.8978C12.903 12.6777 12.7188 13.7545 12.6849 14.9747H15.3147C15.2808 13.7545 15.0966 12.6777 14.8211 11.8978C14.6676 11.4633 14.4965 11.1494 14.331 10.9545C14.1651 10.7593 14.0514 10.733 13.9994 10.733ZM15.5888 11.0051C15.6701 11.1756 15.7444 11.3576 15.8116 11.5478C16.1343 12.4613 16.3308 13.6619 16.3647 14.9747H18.7374C18.5352 13.1307 17.2817 11.6036 15.5888 11.0051ZM12.4101 11.0051C10.7174 11.6037 9.46428 13.1308 9.26213 14.9747H11.6349C11.6688 13.6619 11.8652 12.4613 12.1879 11.5478C12.2551 11.3577 12.3288 11.1756 12.4101 11.0051Z",
				fill: "currentColor"
			})
		});
		case "image": return jsxs(FileGlyph, {
			size,
			className,
			markTransform: FILE_MARK_TRANSFORM,
			children: [
				jsx("path", {
					d: "M10.4212 15.9204C10.5756 15.6558 10.9579 15.6558 11.1123 15.9204L13.6493 20.2696C13.8048 20.5362 13.6125 20.8711 13.3037 20.8711H8.22974C7.92102 20.8711 7.72868 20.5362 7.88423 20.2696L10.4212 15.9204Z",
					fill: "currentColor"
				}),
				jsx("path", {
					d: "M15.4981 13.186C15.6505 12.9117 16.0451 12.9117 16.1975 13.186L20.1368 20.2769C20.2849 20.5435 20.0922 20.8711 19.7872 20.8711H11.9084C11.6034 20.8711 11.4107 20.5435 11.5588 20.2769L15.4981 13.186Z",
					fill: "currentColor"
				}),
				jsx("path", {
					d: "M11.8603 11.3997C11.8603 12.286 11.1418 13.0045 10.2555 13.0045C9.36924 13.0045 8.65076 12.286 8.65076 11.3997C8.65076 10.5134 9.36924 9.79492 10.2555 9.79492C11.1418 9.79492 11.8603 10.5134 11.8603 11.3997Z",
					fill: "currentColor"
				})
			]
		});
		case "markdown": return jsx(FileGlyph, {
			size,
			className,
			markTransform: LARGE_FILE_MARK_TRANSFORM,
			children: jsx("path", {
				d: "M8.7588 19.5V14.6H9.8998L11.9298 17.932H11.3278L13.3018 14.6H14.4428L14.4568 19.5H13.1828L13.1688 16.539H13.3858L11.9088 19.017H11.2928L9.7738 16.539H10.0398V19.5H8.7588ZM15.4375 19.5V14.6H17.7545C18.2958 14.6 18.7718 14.7003 19.1825 14.901C19.5932 15.1017 19.9128 15.384 20.1415 15.748C20.3748 16.112 20.4915 16.546 20.4915 17.05C20.4915 17.5493 20.3748 17.9833 20.1415 18.352C19.9128 18.716 19.5932 18.9983 19.1825 19.199C18.7718 19.3997 18.2958 19.5 17.7545 19.5H15.4375ZM16.8235 18.394H17.6985C17.9785 18.394 18.2212 18.3427 18.4265 18.24C18.6365 18.1327 18.7998 17.9787 18.9165 17.778C19.0332 17.5727 19.0915 17.33 19.0915 17.05C19.0915 16.7653 19.0332 16.5227 18.9165 16.322C18.7998 16.1213 18.6365 15.9697 18.4265 15.867C18.2212 15.7597 17.9785 15.706 17.6985 15.706H16.8235V18.394Z",
				fill: "currentColor"
			})
		});
		case "other": return jsx(FileGlyph, {
			size,
			className,
			muted: true
		});
		case "pdf": return jsx(FileGlyph, {
			size,
			className,
			markTransform: LARGE_FILE_MARK_TRANSFORM,
			children: jsx("path", {
				d: "M6.80616 19.5V14.6H9.04616C9.49416 14.6 9.87916 14.6723 10.2012 14.817C10.5278 14.9617 10.7798 15.1717 10.9572 15.447C11.1345 15.7177 11.2232 16.0397 11.2232 16.413C11.2232 16.7817 11.1345 17.1013 10.9572 17.372C10.7798 17.6427 10.5278 17.8527 10.2012 18.002C9.87916 18.1467 9.49416 18.219 9.04616 18.219H7.57616L8.19216 17.617V19.5H6.80616ZM8.19216 17.764L7.57616 17.127H8.96216C9.2515 17.127 9.46616 17.064 9.60616 16.938C9.75083 16.812 9.82316 16.637 9.82316 16.413C9.82316 16.1843 9.75083 16.007 9.60616 15.881C9.46616 15.755 9.2515 15.692 8.96216 15.692H7.57616L8.19216 15.055V17.764ZM11.8989 19.5V14.6H14.2159C14.7573 14.6 15.2333 14.7003 15.6439 14.901C16.0546 15.1017 16.3743 15.384 16.6029 15.748C16.8363 16.112 16.9529 16.546 16.9529 17.05C16.9529 17.5493 16.8363 17.9833 16.6029 18.352C16.3743 18.716 16.0546 18.9983 15.6439 19.199C15.2333 19.3997 14.7573 19.5 14.2159 19.5H11.8989ZM13.2849 18.394H14.1599C14.4399 18.394 14.6826 18.3427 14.8879 18.24C15.0979 18.1327 15.2613 17.9787 15.3779 17.778C15.4946 17.5727 15.5529 17.33 15.5529 17.05C15.5529 16.7653 15.4946 16.5227 15.3779 16.322C15.2613 16.1213 15.0979 15.9697 14.8879 15.867C14.6826 15.7597 14.4399 15.706 14.1599 15.706H13.2849V18.394ZM17.6821 19.5V14.6H21.5251V15.671H19.0681V19.5H17.6821ZM18.9701 17.82V16.749H21.2311V17.82H18.9701Z",
				fill: "currentColor"
			})
		});
		case "ppt": return jsx(FileGlyph, {
			size,
			className,
			markTransform: LARGE_FILE_MARK_TRANSFORM,
			children: jsx("path", {
				d: "M11.0132 20.5V13.5H14.2132C14.8532 13.5 15.4032 13.6033 15.8632 13.81C16.3299 14.0167 16.6899 14.3167 16.9432 14.71C17.1966 15.0967 17.3232 15.5567 17.3232 16.09C17.3232 16.6167 17.1966 17.0733 16.9432 17.46C16.6899 17.8467 16.3299 18.1467 15.8632 18.36C15.4032 18.5667 14.8532 18.67 14.2132 18.67H12.1132L12.9932 17.81V20.5H11.0132ZM12.9932 18.02L12.1132 17.11H14.0932C14.5066 17.11 14.8132 17.02 15.0132 16.84C15.2199 16.66 15.3232 16.41 15.3232 16.09C15.3232 15.7633 15.2199 15.51 15.0132 15.33C14.8132 15.15 14.5066 15.06 14.0932 15.06H12.1132L12.9932 14.15V18.02Z",
				fill: "currentColor"
			})
		});
		case "video": return jsx(FileGlyph, {
			size,
			className,
			markTransform: FILE_MARK_TRANSFORM,
			children: jsx("path", {
				d: "M17.5 14.634C18.1667 15.0189 18.1667 15.9811 17.5 16.366L11.5 19.8301C10.8333 20.215 10 19.7339 10 18.9641L10 12.0359C10 11.2661 10.8333 10.785 11.5 11.1699L17.5 14.634Z",
				fill: "currentColor"
			})
		});
		case "word": return jsx(FileGlyph, {
			size,
			className,
			markTransform: LARGE_FILE_MARK_TRANSFORM,
			children: jsx("path", {
				d: "M10.5118 20.5L8.24179 13.5H10.2818L12.1918 19.56H11.1618L13.1718 13.5H14.9918L16.8918 19.56H15.9018L17.8718 13.5H19.7618L17.4918 20.5H15.3718L13.7518 15.35H14.3218L12.6318 20.5H10.5118Z",
				fill: "currentColor"
			})
		});
		/* v8 ignore next -- closed-union backstop; only reached if a type is forged */
		default: return assertNever$2(type);
	}
}
/** Closed-union exhaustiveness guard for traditional file artwork. */
/* v8 ignore next 3 -- only reachable when an untyped caller forges a traditional file type */
function assertNever$2(value) {
	throw new Error(`unreachable traditional file type: ${String(value)}`);
}
/**
* Render a decorative file-type glyph for a path or an explicitly resolved kind.
* @param props - Path or kind selection, optional project context, size, and CSS class.
* @returns The category-colored SVG; the caller owns the accessible name and may override
* the color through `--dsh-file-type-icon-color`.
*/
function FileTypeIcon(props) {
	const { size = 28, className } = props;
	const resolvedType = "path" in props ? classifyFileType(props.path, props.context) : props.kind;
	return isCodeFileType(resolvedType) ? jsx(CodeFileIcon, {
		type: resolvedType,
		size,
		className
	}) : glyph(resolvedType, size, clsx(css$21.icon, css$21[resolvedType], className));
}
//#endregion
//#region lib/types/SiteGlyph.js
/**
* Host suffix to site mark, covering the developer sites the transcript
* usually cites plus the mainstream search, video, social, shopping, and
* reference sites a general audience links. A host matches a suffix when it
* equals it or is a subdomain of it, and the longest matching suffix wins, so
* `weixin.qq.com` keeps WeChat while `qq.com` keeps QQ and `gist.github.com`
* needs no entry of its own.
*/
const SITE_HOSTS = {
	"github.com": siGithub,
	"github.io": siGithub,
	"raw.githubusercontent.com": siGithub,
	"gitlab.com": siGitlab,
	"npmjs.com": siNpm,
	"pypi.org": siPypi,
	"stackoverflow.com": siStackoverflow,
	"developer.mozilla.org": siMdnwebdocs,
	"wikipedia.org": siWikipedia,
	"news.ycombinator.com": siYcombinator,
	"youtube.com": siYoutube,
	"youtu.be": siYoutube,
	"x.com": siX,
	"twitter.com": siX,
	"bilibili.com": siBilibili,
	"zhihu.com": siZhihu,
	"juejin.cn": siJuejin,
	"csdn.net": siCsdn,
	"google.com": siGoogle,
	"baidu.com": siBaidu,
	"duckduckgo.com": siDuckduckgo,
	"tiktok.com": siTiktok,
	"netflix.com": siNetflix,
	"spotify.com": siSpotify,
	"facebook.com": siFacebook,
	"instagram.com": siInstagram,
	"reddit.com": siReddit,
	"telegram.org": siTelegram,
	"t.me": siTelegram,
	"weixin.qq.com": siWechat,
	"qq.com": siQq,
	"whatsapp.com": siWhatsapp,
	"wa.me": siWhatsapp,
	"weibo.com": siSinaweibo,
	"taobao.com": siTaobao,
	"aliexpress.com": siAliexpress,
	"ebay.com": siEbay,
	"quora.com": siQuora,
	"v2ex.com": siV2ex,
	"apple.com": siApple
};
/**
* Resolve the mark named by an external destination.
* @param href - The link destination; only an absolute http(s) URL can name a host.
* @returns The matched site mark, or undefined when the host is unknown or not http(s).
*/
function siteIcon(href) {
	let host;
	try {
		const url = new URL(href);
		if (url.protocol !== "http:" && url.protocol !== "https:") return void 0;
		host = url.hostname.toLowerCase();
	} catch {
		return;
	}
	let match;
	let matched = 0;
	for (const [suffix, icon] of Object.entries(SITE_HOSTS)) if ((host === suffix || host.endsWith(`.${suffix}`)) && suffix.length > matched) {
		match = icon;
		matched = suffix.length;
	}
	return match;
}
/**
* Render the site mark for a known external destination.
* @param props - The destination and the icon sizing seat.
* @returns The site's mark riding currentColor, or undefined for an unknown site.
*/
function siteGlyph({ href, size, className }) {
	const icon = href === void 0 ? void 0 : siteIcon(href);
	if (icon === void 0) return void 0;
	return jsx("svg", {
		width: size,
		height: size,
		className,
		viewBox: "-2 -2 28 28",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true,
		children: jsx("path", {
			d: icon.path,
			fill: "currentColor"
		})
	});
}
//#endregion
//#region lib/types/LinkIcon.js
/**
* Derive a file path's link-icon category from its extension. Unknown and
* missing extensions fall to `other` (the plain-paper glyph).
* @param path - File path as the producing tool spelled it (either separator).
* @returns The file's glyph category; never `url` or `folder`.
*/
function classifyLinkPath(path) {
	const type = classifyFileType(path);
	const extension = fileExtension(path);
	if (isCodeFileType(type)) return isLinkCodeExtension(extension) ? "code" : "other";
	if (extension === "") return "other";
	switch (type) {
		case "code":
		case "html": return "code";
		case "image": return "image";
		case "excel":
		case "pdf":
		case "ppt":
		case "word": return "document";
		case "markdown":
		case "other":
		case "video": return "other";
		/* v8 ignore next -- classifyFileType returns a closed union exhausted above */
		default: return assertNever$1(type);
	}
}
const PhotoGlyph = ({ size, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M12.4326 2.38086H3.56763C2.46306 2.38086 1.56763 3.27629 1.56763 4.38086V11.6192C1.56763 12.7237 2.46306 13.6192 3.56763 13.6192H12.4326C13.5372 13.6192 14.4326 12.7237 14.4326 11.6192V4.38086C14.4326 3.27629 13.5372 2.38086 12.4326 2.38086Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M10.536 7.03286C11.1948 7.03286 11.7288 6.49884 11.7288 5.8401C11.7288 5.18136 11.1948 4.64734 10.536 4.64734C9.87728 4.64734 9.34326 5.18136 9.34326 5.8401C9.34326 6.49884 9.87728 7.03286 10.536 7.03286Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M1.5979 9.28409L4.17738 7.37514C4.57462 7.08117 5.12701 7.12145 5.47741 7.46992L8.3322 10.309C8.6572 10.6323 9.1605 10.6931 9.5532 10.4566L10.8859 9.65399C11.2531 9.43289 11.7205 9.47039 12.0477 9.74729L14.2823 11.6379",
			stroke: "currentColor"
		})
	]
});
const PaperDocGlyph = ({ size, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [
		jsx("path", {
			d: "M3.51919 14.5069H12.4807C13.0679 14.5069 13.5438 14.031 13.5438 13.4438V5.97499C13.5438 5.68818 13.428 5.41352 13.2226 5.21341L9.71251 1.79459C9.51402 1.60124 9.24781 1.49304 8.97075 1.49304H3.51919C2.93204 1.49304 2.45605 1.96902 2.45605 2.55618V13.4438C2.45605 14.031 2.93203 14.5069 3.51919 14.5069Z",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M8.90454 1.6095V4.87091C8.90454 5.45806 9.38051 5.93405 9.96768 5.93405H13.4953",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M4.31152 8.7561H7.83046",
			stroke: "currentColor"
		}),
		jsx("path", {
			d: "M4.31152 11.3651H9.36598",
			stroke: "currentColor"
		})
	]
});
const PaperGlyph = ({ size, className, strokeWidth }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 16 16",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	"aria-hidden": "true",
	strokeWidth,
	children: [jsx("path", {
		d: "M3.75275 14.271H12.2473C12.7749 14.271 13.2027 13.8433 13.2027 13.3156V5.91732C13.2027 5.65958 13.0985 5.41276 12.9139 5.23293L9.59477 2.00011C9.4164 1.82636 9.17717 1.72913 8.9282 1.72913H3.75275C3.22511 1.72913 2.79736 2.15686 2.79736 2.68451V13.3156C2.79736 13.8433 3.22511 14.271 3.75275 14.271Z",
		stroke: "currentColor"
	}), jsx("path", {
		d: "M8.84888 1.83838V4.94133C8.84888 5.46896 9.2766 5.89671 9.80426 5.89671H13.157",
		stroke: "currentColor"
	})]
});
/** Local exhaustiveness helper — this package does not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a kind is forged */
function assertNever$1(value) {
	throw new Error(`unreachable link icon kind: ${String(value)}`);
}
/**
* Render the leading glyph for one clickable artifact link at one stroke weight.
* @param props - The link category, optional size (default 14px), and optional CSS class.
* @returns The category's decorative current-color SVG glyph.
*/
function LinkIconArtwork({ kind, href, size = 14, className, strokeWidth }) {
	switch (kind) {
		case "url": return siteGlyph({
			href,
			size,
			className
		}) ?? jsx(GlobeOutlineArtwork, {
			size,
			className,
			strokeWidth
		});
		case "folder": return jsx(FolderCloseArtwork, {
			size,
			className,
			strokeWidth
		});
		case "code": return jsx(CodeBracketsArtwork, {
			size,
			className,
			strokeWidth
		});
		case "image": return jsx(PhotoGlyph, {
			size,
			className,
			strokeWidth
		});
		case "document": return jsx(PaperDocGlyph, {
			size,
			className,
			strokeWidth
		});
		case "other": return jsx(PaperGlyph, {
			size,
			className,
			strokeWidth
		});
		/* v8 ignore next -- closed-union backstop; only reached if a kind is forged */
		default: return assertNever$1(kind);
	}
}
/**
* Render a regular one-pixel link icon.
* @param props - Link category, size, and optional class.
* @returns The regular decorative link glyph.
*/
function LinkIconRegular(props) {
	return jsx(LinkIconArtwork, {
		...props,
		strokeWidth: 1
	});
}
/**
* Render a medium 1.3px link icon.
* @param props - Link category, size, and optional class.
* @returns The medium decorative link glyph.
*/
function LinkIconMedium(props) {
	return jsx(LinkIconArtwork, {
		...props,
		strokeWidth: ICON_MEDIUM_STROKE
	});
}
//#endregion
//#region lib/types/user-text.js
/** The wire form a session chip serializes to; label is the display text. */
const SESSION_WIRE_RE = /@\[([^\]\n]+)\]\(dsh-session:[^)\s]+\)/gu;
/** Sentence punctuation a bare `@name` token may carry without being part of the reference. */
const TRAILING_PUNCTUATION_RE = /[.,;:!?，。；：！？]+$/u;
/**
* Split one sent text into inline plain runs and reference chips.
* @param text - the logged model text of the message or queue row.
* @param sessionLabels - exact session mention labels associated by an adjacent recall.
* @param slashNames - names a `/name` token may decorate as: the skills the
* host loaded for this message, or the command a command bubble echoes
* (unsent queue rows pass none).
* @param slashKind - the chip kind those tokens render as.
* @param references - optional file and skill preview actions; session and command tokens stay labels.
* @returns inline nodes covering the whole text.
*/
function projectUserText(text, sessionLabels, slashNames = [], slashKind = "skill", references) {
	const ranges = [];
	SESSION_WIRE_RE.lastIndex = 0;
	let wire;
	while ((wire = SESSION_WIRE_RE.exec(text)) !== null) ranges.push({
		start: wire.index,
		end: wire.index + wire[0].length,
		label: wire[0],
		kind: "session",
		display: wire[1]
	});
	for (const rawLabel of [...new Set(sessionLabels)].sort((a, b) => b.length - a.length)) {
		const label = `@${rawLabel}`;
		let start = text.indexOf(label);
		while (start >= 0) {
			ranges.push({
				start,
				end: start + label.length,
				label,
				kind: "session"
			});
			start = text.indexOf(label, start + label.length);
		}
	}
	const re = /(^|\s)(\/[\w-]+(?=\s|$)|@"[^"\n]+"|@[^\s]+)/gu;
	let m;
	while ((m = re.exec(text)) !== null) {
		const tokenStart = m.index + m[1].length;
		const rawLabel = m[2];
		const label = rawLabel.startsWith("@\"") ? rawLabel : rawLabel.replace(TRAILING_PUNCTUATION_RE, "");
		if (label.length <= 1) continue;
		if (label.startsWith("/") && !slashNames.includes(label.slice(1))) continue;
		ranges.push({
			start: tokenStart,
			end: tokenStart + label.length,
			label,
			kind: "plain"
		});
	}
	const rankOf = (range) => range.kind === "session" ? 0 : 1;
	ranges.sort((a, b) => a.start - b.start || rankOf(a) - rankOf(b) || b.end - a.end);
	const parts = [];
	let cursor = 0;
	const pushPlain = (from, to) => {
		parts.push(jsx("span", {
			className: css$22.plainRun,
			children: text.slice(from, to)
		}, `t${from}`));
	};
	for (const range of ranges) {
		if (range.start < cursor) continue;
		const { start: tokenStart, end, label, kind } = range;
		if (tokenStart > cursor) pushPlain(cursor, tokenStart);
		const referenceKind = kind === "session" ? "session" : label.startsWith("@") ? label.replace(/^@"|"$/gu, "").endsWith("/") ? "folder" : "file" : void 0;
		const displayLabel = range.display ?? (referenceKind === void 0 ? label : referenceKind === "session" ? label.slice(1) : label.slice(1).replace(/^"|"$/gu, "").split(/[\\/]/u).filter(Boolean).at(-1) ?? label.slice(1));
		const contents = jsxs(Fragment, { children: [referenceKind !== void 0 && jsx(ReferenceIconRegular, {
			kind: referenceKind,
			size: 16,
			className: css$22.refIcon
		}), displayLabel] });
		const open = references === void 0 ? void 0 : referenceKind === "file" ? () => {
			references.openFile(label.slice(1).replace(/^"|"$/gu, ""));
		} : referenceKind === void 0 && slashKind === "skill" ? () => {
			references.openSkill(label.slice(1));
		} : void 0;
		const className = clsx(css$22.refChip, referenceKind === void 0 && css$22.slashChip);
		parts.push(open === void 0 ? jsx("span", {
			className,
			"data-ref-chip": referenceKind ?? slashKind,
			title: label,
			children: contents
		}, tokenStart) : jsx("button", {
			type: "button",
			className: clsx(className, markdownCss.fileMention),
			"data-ref-chip": referenceKind ?? slashKind,
			title: label,
			onClick: (event) => {
				if (event.detail > 1 || event.detail !== 0 && event.currentTarget.ownerDocument.getSelection()?.isCollapsed === false) return;
				open();
			},
			children: contents
		}, tokenStart));
		cursor = end;
	}
	if (parts.length === 0) return jsx("span", {
		className: css$22.plainRun,
		children: text
	});
	if (cursor < text.length) pushPlain(cursor, text.length);
	return jsx(Fragment, { children: parts });
}
//#endregion
//#region lib/types/Toast.js
/** Full-opacity hold before the fade starts, when the owner names none. */
const HOLD_MS = 3e3;
/** Fade duration. Must agree with the stylesheet's toast-fade duration. */
const FADE_MS = 1e3;
/**
* Transient top-center banner: slides in, holds at full opacity, fades out,
* then reports done so the owner can unmount it. Re-showing the same text
* restarts the cycle when the owner remounts the component (key it by a
* per-show sequence). Rendered through a body portal so an owner inside a
* transformed or filtered ancestor cannot trap the fixed banner in that
* ancestor's box.
* With unchanged holdMs, parent rerenders do not extend the lifetime.
* Completion calls the latest onDone handler; fully faded actions receive no input.
*
* The hold is the owner's to set, because how long a banner has to stay
* depends on how much there is to read: a one-line limit lands in the default
* window, while a failure that names what broke does not. One value drives
* both the unmount timer and the stylesheet's fade delay — the stylesheet
* reads it as a custom property — so the two can no longer disagree and leave
* the banner unmounting mid-fade.
* @param props.text - resolved banner copy; the owner passes localized text.
* @param props.icon - optional leading glyph (e.g. a warning icon); ignored
* under `tone="success"`, which brings its own glyph.
* @param props.tone - 'success' renders the design's circled green check as
* the leading glyph; omitted, the icon seat keeps its warning tint.
* @param props.actions - optional inline actions continuing the sentence:
* each renders its plain-text `prefix` (a connective like 或) followed by its
* localized `label` as blue clickable text, flowing after `text` as one
* sentence. Each press is the owner's to handle (e.g. undo the reported
* change, then unmount the toast). The banner surface stays click-through —
* only the action text takes the pointer.
* @param props.holdMs - full-opacity hold before the fade; defaults to 3000.
* @param props.anchor - optional element whose horizontal center the banner
* follows (e.g. the composer card, so the banner centers over the chat column
* rather than the whole window); omitted, it centers on the viewport.
* @param props.onDone - called once the fade completes; unmount the toast here.
* @returns the floating banner.
*/
function Toast({ text, icon, tone, anchor, holdMs = HOLD_MS, actions, onDone }) {
	const latestOnDone = useRef(onDone);
	useLayoutEffect(() => {
		latestOnDone.current = onDone;
	}, [onDone]);
	useEffect(() => {
		const timer = setTimeout(() => {
			latestOnDone.current();
		}, holdMs + FADE_MS);
		return () => {
			clearTimeout(timer);
		};
	}, [holdMs]);
	const [left, setLeft] = useState(null);
	useLayoutEffect(() => {
		if (anchor == null) return;
		const measure = () => {
			const rect = anchor.getBoundingClientRect();
			setLeft(rect.left + rect.width / 2);
		};
		measure();
		window.addEventListener("resize", measure);
		return () => {
			window.removeEventListener("resize", measure);
		};
	}, [anchor]);
	return createPortal(jsxs("div", {
		className: css$23.toast,
		role: "alert",
		style: {
			...left === null ? {} : { left },
			"--dsh-toast-hold": `${String(holdMs)}ms`
		},
		children: [tone === "success" ? jsx("span", {
			className: `${css$23.icon} ${css$23.success}`,
			"aria-hidden": true,
			children: jsx(IconCheckCircleOutlineRegular, {})
		}) : icon !== void 0 && jsx("span", {
			className: css$23.icon,
			"aria-hidden": true,
			children: icon
		}), jsxs("span", {
			className: css$23.text,
			children: [text, actions?.map((action) => jsxs(Fragment$1, { children: [action.prefix, jsx("button", {
				type: "button",
				className: css$23.action,
				onClick: action.onClick,
				children: action.label
			})] }, action.label))]
		})]
	}), document.body);
}
//#endregion
//#region lib/types/file-size.js
/** Compact human-readable byte counts shared by attachment presenters. @module @deepseek-ai/dsh-client-ui-primitives/file-size */
/**
* Byte count as compact user-facing size text (`312B`, `4.2KB`, `1.5MB`, `2.4GB`).
* @param bytes - exact byte count.
* @returns whole-unit text with one decimal below ten of the chosen unit.
*/
function fileSizeText(bytes) {
	if (bytes < 1024) return `${bytes}B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)}KB`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)}MB`;
	const gb = mb / 1024;
	return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)}GB`;
}
//#endregion
//#region lib/types/settings-form/SettingsForm.js
/**
* One plugin's settings form as its page on the Plugins page shows it: the
* read-only notice when the deployment stores settings read-only, the
* plugin's controls, and the save that writes every staged edit. The page
* draws the plugin's title and one-liner itself.
*
* Only a save writes. Leaving the page drops every staged edit, so the form
* discards on unmount and offers no discard control. A form whose namespace
* the Host stopped serving says so in place of its controls rather than
* showing fields nothing would accept.
*/
/**
* Render one plugin's settings form.
* @param props - the form's copy and state, its controls, and the save and discard actions.
* @returns the form, or the unavailable line while the namespace is not served.
*/
function SettingsForm(props) {
	const { state, labels } = props;
	const discard = useRef(props.onDiscard);
	discard.current = props.onDiscard;
	useEffect(() => () => {
		discard.current();
	}, []);
	if (!state.available) return jsx("p", {
		className: css$24.unavailable,
		role: "status",
		children: labels.unavailable
	});
	const blocked = !state.dirty || state.invalid || state.saving;
	return jsxs("div", {
		className: css$24.form,
		children: [
			!state.writable ? jsx("p", {
				className: css$24.readOnly,
				role: "status",
				children: labels.readOnly
			}) : null,
			props.children,
			jsxs("div", {
				className: css$24.footer,
				children: [state.failed ? jsx("p", {
					className: css$24.failed,
					role: "status",
					children: labels.saveFailed
				}) : null, jsx("button", {
					type: "button",
					className: css$24.save,
					disabled: blocked,
					onClick: props.onSave,
					children: state.saving ? labels.saving : labels.save
				})]
			})
		]
	});
}
//#endregion
//#region lib/types/settings-form/fields.js
/**
* The controls of a settings form. Each renders one field's label, its staged
* text, whether saving would leave an override, and — when one stands — the
* reset that stages a clear back to the composition layer. Nothing here
* writes: a control reports what the user typed, and the form's save is the
* single point where a draft becomes a document mutation.
*/
/**
* A staged value field. `numeric` only hints the keypad: which drafts a field
* accepts is decided by its spec, so the control never silently rewrites what
* the user typed.
* @param props - the field's copy, its staged text, and the edit actions.
* @returns the labelled control.
*/
function SettingsValueField(props) {
	const [helpOpen, setHelpOpen] = useState(false);
	const helpId = `${props.id}-help`;
	const messageId = `${props.id}-message`;
	const hasMessage = props.invalid || Boolean(props.hint);
	const description = [hasMessage ? messageId : "", helpOpen ? helpId : ""].filter(Boolean).join(" ");
	return jsxs("div", {
		className: css$25.field,
		children: [
			jsxs("div", {
				className: css$25.head,
				children: [jsxs("div", {
					className: css$25.labelGroup,
					children: [jsx("label", {
						className: css$25.label,
						htmlFor: props.id,
						children: props.label
					}), props.help !== void 0 ? jsx("button", {
						type: "button",
						className: css$25.helpButton,
						"aria-label": props.help.label,
						"aria-expanded": helpOpen,
						"aria-controls": helpId,
						onClick: () => {
							setHelpOpen(!helpOpen);
						},
						children: jsx(IconInfoOutlineRegular, { size: 12 })
					}) : null]
				}), props.overridden ? jsxs("span", {
					className: css$25.badges,
					children: [jsx(Tag, {
						tone: "neutral",
						children: props.overriddenLabel
					}), jsx("button", {
						type: "button",
						className: css$25.reset,
						disabled: props.disabled,
						onClick: props.onReset,
						children: props.resetLabel
					})]
				}) : null]
			}),
			jsx("input", {
				id: props.id,
				className: css$25.input,
				type: "text",
				...props.numeric === true ? { inputMode: "numeric" } : {},
				...props.invalid ? { "aria-invalid": true } : {},
				"aria-describedby": description || void 0,
				value: props.text,
				placeholder: props.placeholder ?? "",
				disabled: props.disabled,
				onChange: (event) => {
					props.onEdit(event.target.value);
				}
			}),
			hasMessage ? jsx("p", {
				id: messageId,
				className: props.invalid ? css$25.invalid : css$25.hint,
				children: props.invalid ? props.invalidLabel : props.hint
			}) : null,
			props.help !== void 0 && helpOpen ? jsx("div", {
				id: helpId,
				className: css$25.help,
				role: "region",
				"aria-label": props.help.label,
				children: props.help.content
			}) : null
		]
	});
}
/**
* A write-only credential control. The value never rides a response, so the
* control reports only whether one is configured and starts blank; a blank
* draft writes nothing, which keeps the stored key rather than clearing it.
* The control asks browsers not to autofill saved login passwords.
* @param props - the field's copy, its staged text, and the configured state.
* @returns the labelled control.
*/
function SettingsSecretField(props) {
	return jsxs("div", {
		className: css$25.field,
		children: [
			jsxs("div", {
				className: css$25.head,
				children: [jsx("label", {
					className: css$25.label,
					htmlFor: props.id,
					children: props.label
				}), jsx("span", {
					className: css$25.badges,
					children: jsx(Tag, {
						tone: props.configured ? "neutral" : "quiet",
						children: props.stateLabel
					})
				})]
			}),
			jsx("input", {
				id: props.id,
				className: css$25.input,
				type: "password",
				autoComplete: "new-password",
				value: props.text,
				disabled: props.disabled,
				onChange: (event) => {
					props.onEdit(event.target.value);
				}
			}),
			jsx("p", {
				className: css$25.hint,
				children: props.hint
			})
		]
	});
}
//#endregion
//#region lib/types/settings-form/form-model.js
/**
* The staged form model behind a plugin's settings page.
*
* A card stages what the user types and writes it only when they save. Each
* settings write is a durable, revision-fenced document mutation, so a control
* that committed as it settled turned one edit into a write the user never
* asked for and could not preview; staged text makes what is on screen exactly
* what a save would store.
*
* A field shows its effective value — the user layer over the composition
* layer over the schema default — and whether the user layer carries it. That
* presence, not a value comparison, is what marks a field overridden: an
* override equal to the composition default is still an override.
*/
/**
* A whole-number field. An empty draft clears the field; any other draft that
* is not a finite number blocks the save.
* @param field - field name inside the namespace section.
* @returns the field's conversion spec.
*/
function settingsNumberField(field) {
	return {
		field,
		format: (value) => typeof value === "number" ? String(value) : "",
		parse: (text) => {
			const trimmed = text.trim();
			if (trimmed === "") return { kind: "clear" };
			const parsed = Number(trimmed);
			return Number.isFinite(parsed) ? {
				kind: "set",
				value: parsed
			} : void 0;
		}
	};
}
/**
* A free-text field. An empty draft clears the field, so emptying the control
* and saving is the same gesture as resetting it.
* @param field - field name inside the namespace section.
* @returns the field's conversion spec.
*/
function settingsTextField(field) {
	return {
		field,
		format: (value) => typeof value === "string" ? value : "",
		parse: (text) => {
			const trimmed = text.trim();
			return trimmed === "" ? { kind: "clear" } : {
				kind: "set",
				value: trimmed
			};
		}
	};
}
/**
* Stages one card's edits over one settings namespace and writes them on save.
*
* The form publishes through a snapshot store because slot components read
* through a snapshot selector, while both the scope and the local drafts
* change underneath; every projection is rebuilt from the two together.
*/
var SettingsFormModel = class {
	scope;
	specs;
	secretSpecs;
	staged = /* @__PURE__ */ new Map();
	listeners = /* @__PURE__ */ new Set();
	baseline;
	unsubscribe;
	saving = false;
	failed = false;
	/**
	* @param scope - the shared configuration form for this card's namespace.
	* @param specs - the section fields this card edits.
	* @param secrets - the card's write-only controls, written outside the section.
	*/
	constructor(scope, specs, secrets = []) {
		this.scope = scope;
		this.specs = new Map(specs.map((spec) => [spec.field, spec]));
		this.secretSpecs = new Map(secrets.map((spec) => [spec.field, spec]));
		this.unsubscribe = scope.subscribe(() => {
			this.publish();
		});
	}
	/**
	* Publish a projection of this form, rebuilt whenever the scope or a draft changes.
	* @param project - build the card's state from the form's current reads.
	* @returns the store the card's component reads through its bound selector.
	*/
	bind(project) {
		const store = createSnapshotStore(project());
		this.listeners.add(() => {
			store.set(project());
		});
		return store;
	}
	/**
	* Read the card-level state: what the Host serves, and what a save would do.
	* @returns the form state every card shares.
	*/
	shell() {
		const snapshot = this.scope.getSnapshot();
		const plan = this.plan();
		return {
			available: snapshot.status === "ready",
			writable: snapshot.writable,
			dirty: plan.length > 0,
			invalid: plan.some((item) => item.run === void 0 && item.op === void 0),
			saving: this.saving,
			failed: this.failed
		};
	}
	/**
	* Read one control's state.
	* @param field - field name of a section field or of a write-only control.
	* @returns the draft text, whether a save would leave an override, and whether it is invalid.
	*/
	field(field) {
		const staged = this.staged.get(field);
		if (this.secretSpecs.has(field)) return {
			text: staged?.text ?? "",
			overridden: false,
			invalid: false
		};
		const spec = this.spec(field);
		if (staged === void 0) return {
			text: spec.format(this.sectionValue(field)),
			overridden: this.stored(field),
			invalid: false
		};
		const write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
		return {
			text: staged.text,
			overridden: write?.kind === "set",
			invalid: write === void 0
		};
	}
	/**
	* Build the edit, reset, save, and discard actions bound to this form.
	* @returns the actions a card's slot entry injects.
	*/
	actions() {
		return {
			edit: (field, text) => {
				this.stage(field, {
					text,
					clear: false
				});
			},
			resetField: (field) => {
				this.stage(field, {
					text: this.spec(field).format(this.baseValue(field)),
					clear: true
				});
			},
			save: () => {
				this.save();
			},
			discard: () => {
				if (this.staged.size === 0 && !this.failed) return;
				this.staged.clear();
				this.baseline = void 0;
				this.failed = false;
				this.publish();
			}
		};
	}
	/**
	* Write every staged edit, then re-seed from what the Host accepted.
	*
	* The Host is the only authority on whether a value was accepted — its
	* validators own the constraints no schema can express — so the outcome is
	* read back from the section rather than predicted here. A save that did not
	* land keeps its drafts, so the user can correct them instead of retyping.
	* @returns settlement after every write and the read-back.
	*/
	async save() {
		const plan = this.plan();
		if (!plan.length || this.saving || !this.scope.getSnapshot().writable || plan.some((item) => item.run === void 0 && item.op === void 0)) return;
		this.saving = true;
		this.failed = false;
		this.publish();
		try {
			const ops = plan.flatMap((item) => item.op === void 0 ? [] : [item.op]);
			let landed = !ops.length || await this.scope.mutate(ops, this.baseline?.revision);
			if (!landed) {
				this.failed = true;
				return;
			}
			for (const item of plan) if (item.run) landed = await item.run() && landed;
			if (landed) {
				this.staged.clear();
				this.baseline = void 0;
			}
			this.failed = !landed;
		} catch (_error) {
			this.failed = true;
		} finally {
			this.saving = false;
			this.publish();
		}
	}
	/** Release the form's accepted-value subscription. */
	dispose() {
		this.unsubscribe();
		this.listeners.clear();
	}
	/**
	* Every staged edit a save would write. An entry whose draft is not a value
	* its field accepts carries no write: the form is still dirty, and the save
	* refuses rather than dropping the edit.
	* @returns the planned writes, in the order the fields were staged.
	*/
	plan() {
		const plan = [];
		for (const [field, staged] of this.staged) {
			const secret = this.secretSpecs.get(field);
			if (secret !== void 0) {
				const value = staged.text.trim();
				if (value !== "") plan.push({
					field,
					run: () => secret.write(value)
				});
				continue;
			}
			const spec = this.spec(field);
			if (staged.clear) {
				if (this.stored(field)) plan.push({
					field,
					op: {
						op: "unset",
						path: [field]
					}
				});
				continue;
			}
			if (staged.text === spec.format(this.sectionValue(field))) continue;
			const write = spec.parse(staged.text);
			if (write === void 0) plan.push({ field });
			else if (write.kind === "clear") plan.push({
				field,
				op: {
					op: "unset",
					path: [field]
				}
			});
			else plan.push({
				field,
				op: {
					op: "set",
					path: [field],
					value: write.value
				}
			});
		}
		return plan;
	}
	stage(field, edit) {
		this.baseline ??= this.scope.getSnapshot();
		this.staged.set(field, edit);
		this.failed = false;
		this.publish();
	}
	spec(field) {
		const spec = this.specs.get(field);
		if (spec === void 0) throw new Error(`plugin card has no field ${field}`);
		return spec;
	}
	snapshotOf() {
		return this.scope.getSnapshot();
	}
	sectionValue(field) {
		return this.snapshotOf().value?.[field];
	}
	baseValue(field) {
		return this.snapshotOf().base?.[field];
	}
	userLayer() {
		return this.snapshotOf().user;
	}
	stored(field) {
		const user = this.userLayer();
		return user !== void 0 && Object.hasOwn(user, field);
	}
	publish() {
		for (const listener of this.listeners) listener();
	}
};
//#endregion
//#region lib/types/markdown/highlight.js
/**
* The client's ONE syntax highlighter: a synchronous fine-grained shiki core
* (JavaScript regex engine — no oniguruma WASM, bundle-friendly) with an
* explicit grammar allowlist and a CSS-variables theme. Colors live in the
* theme package's token sheets as `--shiki-*` custom properties (light and
* dark blocks), never here — the repo's tokens-only styling rule.
*
* Only the three markdown-fence and `run_code` grammars (TypeScript, shell,
* JSON) load into the singleton at boot — the set every session renders. Every
* other language in the shared extension table
* (`@deepseek-ai/dsh-util-code-language`: python, rust, yaml, markup, …) is
* imported lazily and registered the first time such a language is requested,
* so a session that never opens a code surface in one of those languages pays
* neither the grammar modules nor their synchronous init. The first render of a
* lazy language falls back to plain text while its grammar loads, then
* {@link onGrammarLoaded} notifies subscribers to re-render with highlighting.
* An unknown or absent language falls back to plain text (no highlighting, still
* monospace) — never an error.
*/
/**
* Grammars the singleton loads at boot; each entry's own `name` is the id
* `codeToTokens`/`codeToHtml` resolve. The JS-family aliases (js/jsx/ts/tsx)
* resolve to the TypeScript grammar rather than a separate one: it tokenizes
* plain TS/JS exactly, and JSX/TSX approximately (shiki's TS grammar is not the
* dedicated TSX grammar, so JSX elements tokenize imperfectly) — an accepted
* trade to keep the boot set to one JS-family grammar. Every other language in
* the shared extension table loads lazily through {@link LAZY_GRAMMARS}.
*/
const LANGS = [
	langTs,
	langBash,
	langJson
];
/**
* The non-boot extension grammars, each behind a dynamic import so its module
* stays out of the boot chunk until a code surface renders that language.
* Keyed by the grammar id (`LanguageRegistration.name`) the aliases resolve to.
* `@shikijs/langs`' default export is a `LanguageRegistration[]`; the loader
* hands the whole array to `loadLanguageSync`, which registers each entry
* (including embedded sub-grammars). The three boot grammars are absent —
* already loaded, so no alias value ever points at a missing entry here.
*/
const LAZY_GRAMMARS = new Map(); // Offline fixtures retain original boot grammars (TS, JSON, shell); others use original plain fallback.
/**
* Language ids (and aliases) the highlighter accepts; everything else renders
* plain. A Map, not an object: fence info strings are assistant-authored, so
* a label like `constructor` or `__proto__` must miss instead of resolving an
* inherited property and crashing the renderer inside shiki. Keys cover both
* the markdown-fence aliases `CodeBlock` uses, the file-extension language ids
* `@deepseek-ai/dsh-util-code-language` resolves, and the short ids
* `readLangHintForPath` persists, so every caller resolves the same grammars.
* A new short name in the shared table must be aliased here too. The JS family maps to the TypeScript grammar (see {@link LANGS} for
* the JSX/TSX approximation). A value not in {@link LANGS} names a
* {@link LAZY_GRAMMARS} entry loaded on first use.
*/
const LANG_ALIASES = new Map([
	["typescript", "typescript"],
	["ts", "typescript"],
	["tsx", "typescript"],
	["javascript", "typescript"],
	["js", "typescript"],
	["jsx", "typescript"],
	["shellscript", "shellscript"],
	["bash", "shellscript"],
	["sh", "shellscript"],
	["shell", "shellscript"],
	["zsh", "shellscript"],
	["json", "json"],
	["jsonc", "json"],
	["py", "python"],
	["python", "python"],
	["rb", "ruby"],
	["ruby", "ruby"],
	["go", "go"],
	["rs", "rust"],
	["rust", "rust"],
	["java", "java"],
	["c", "c"],
	["cpp", "cpp"],
	["cs", "csharp"],
	["csharp", "csharp"],
	["kotlin", "kotlin"],
	["swift", "swift"],
	["php", "php"],
	["yaml", "yaml"],
	["yml", "yaml"],
	["toml", "toml"],
	["ini", "ini"],
	["md", "markdown"],
	["markdown", "markdown"],
	["mdx", "mdx"],
	["html", "html"],
	["css", "css"],
	["scss", "scss"],
	["less", "less"],
	["sql", "sql"],
	["xml", "xml"],
	["lua", "lua"],
	["bat", "bat"],
	["batch", "bat"],
	["powershell", "powershell"],
	["ps1", "powershell"],
	["ps", "powershell"],
	["fish", "fish"],
	["properties", "ini"],
	["dotenv", "dotenv"],
	["env", "dotenv"],
	["log", "log"],
	["csv", "csv"],
	["diff", "diff"],
	["patch", "diff"],
	["http", "http"],
	["rst", "rst"],
	["latex", "latex"],
	["tex", "latex"],
	["bibtex", "bibtex"],
	["bib", "bibtex"],
	["asciidoc", "asciidoc"],
	["adoc", "asciidoc"],
	["r", "r"],
	["julia", "julia"],
	["jl", "julia"],
	["dart", "dart"],
	["scala", "scala"],
	["clojure", "clojure"],
	["clj", "clojure"],
	["erlang", "erlang"],
	["erl", "erlang"],
	["elixir", "elixir"],
	["ex", "elixir"],
	["exs", "elixir"],
	["haskell", "haskell"],
	["hs", "haskell"],
	["fsharp", "fsharp"],
	["fs", "fsharp"],
	["fsi", "fsharp"],
	["fsx", "fsharp"],
	["vb", "vb"],
	["vbnet", "vb"],
	["perl", "perl"],
	["pl", "perl"],
	["pm", "perl"],
	["verilog", "verilog"],
	["v", "verilog"],
	["system-verilog", "system-verilog"],
	["systemverilog", "system-verilog"],
	["sv", "system-verilog"],
	["svh", "system-verilog"],
	["graphql", "graphql"],
	["gql", "graphql"],
	["proto", "proto"],
	["protobuf", "proto"],
	["hcl", "hcl"],
	["tf", "hcl"],
	["tfvars", "hcl"],
	["nix", "nix"],
	["vue", "vue"],
	["svelte", "svelte"],
	["make", "make"],
	["makefile", "make"],
	["mk", "make"],
	["cmake", "cmake"],
	["groovy", "groovy"],
	["gradle", "groovy"]
]);
/**
* Resolve a language hint to the grammar id {@link LANG_ALIASES} selects.
* @param lang - Language hint from a code surface: a canonical grammar id or the read card's persisted short id.
* @returns The resolved grammar id, or `undefined` when the table aliases no grammar.
*/
function grammarForHint(lang) {
	return lang === void 0 ? void 0 : LANG_ALIASES.get(lang.toLowerCase());
}
/**
* Whether a language hint can use the shared syntax highlighter.
* @param lang - Language hint from a code surface.
* @returns Whether the hint resolves to a supported grammar.
*/
function supportsHighlighting(lang) {
	return grammarForHint(lang) !== void 0;
}
/** All token colors resolve through `--shiki-*` custom properties (theme package sheets). */
const cssVariablesTheme = createCssVariablesTheme({
	name: "css-variables",
	variablePrefix: "--shiki-",
	fontStyle: true
});
/**
* The client regex engine compiles each TextMate pattern when its scanner is
* created. Shiki otherwise defers patterns longer than 3,000 characters until
* their first match; that compilation counts against Shiki's 500 ms per-line
* budget and can return a partial token stream under host contention. Eager
* compilation leaves the same budget in place for scanning user content.
*/
const regexEngine = createJavaScriptRegexEngine({
	forgiving: true,
	regexConstructor: (pattern) => defaultJavaScriptRegexConstructor(pattern, { lazyCompileLength: Number.POSITIVE_INFINITY })
});
let singleton;
/** Representative paths through every boot grammar, compiled before user content is timed. */
const BOOT_GRAMMAR_WARMUPS = [
	{
		lang: "typescript",
		code: "const answer: number = 42"
	},
	{
		lang: "shellscript",
		code: "printf '%s\\n' \"$HOME\""
	},
	{
		lang: "json",
		code: "{\"ready\":true}"
	}
];
/** Construct and pre-tokenize the boot grammars outside the user-content scan budget. */
function createHighlighter() {
	const instance = createHighlighterCoreSync({
		themes: [cssVariablesTheme],
		langs: LANGS,
		engine: regexEngine
	});
	for (const sample of BOOT_GRAMMAR_WARMUPS) instance.codeToTokens(sample.code, {
		lang: sample.lang,
		theme: "css-variables",
		tokenizeTimeLimit: 0
	});
	return instance;
}
/** The synchronous highlighter (one instance per document); pre-warmed below, lazy as the fallback. */
function highlighter() {
	singleton ??= createHighlighter();
	return singleton;
}
/** Grammar ids whose lazy import is in flight or done, so it is requested once. */
const requested = /* @__PURE__ */ new Set();
/** Subscribers re-rendered after a lazy grammar registers (React callers). */
const listeners = /* @__PURE__ */ new Set();
/** Bumped on each lazy-grammar load; the `useSyncExternalStore` snapshot. */
let loadCount = 0;
/**
* Subscribe to lazy-grammar load completions; `listener` fires after a
* {@link LAZY_GRAMMARS} grammar finishes registering on the singleton, so a
* caller that rendered its plain fallback while the grammar loaded can
* re-highlight. Uses the `useSyncExternalStore` subscribe signature; pair it with
* {@link grammarLoadCount} as the snapshot. Returns an unsubscribe function.
* @param listener - invoked (no args) on each grammar-load completion.
* @returns a disposer that removes the listener.
*/
function subscribeGrammarLoaded(listener) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
/**
* The lazy-grammar load counter — a value that changes on every load, so a
* `useSyncExternalStore` snapshot re-renders the subscriber when a grammar
* registers. Opaque: only its identity across renders matters.
* @returns the current load count.
*/
function grammarLoadCount() {
	return loadCount;
}
/**
* Ensure the grammar `resolved` names is registered. A boot grammar (not in
* {@link LAZY_GRAMMARS}) and an already-loaded lazy grammar report ready
* synchronously; a lazy grammar not yet loaded starts its import (once) and
* reports not-ready, so the caller renders plain until a
* {@link subscribeGrammarLoaded} listener fires.
* @param resolved - the grammar id an alias resolved to.
* @returns whether the grammar is registered and ready to tokenize now.
*/
function ensureGrammar(resolved) {
	const load = LAZY_GRAMMARS.get(resolved);
	if (load === void 0) return true;
	if (highlighter().getLoadedLanguages().includes(resolved)) return true;
	if (!requested.has(resolved)) {
		requested.add(resolved);
		load().then((mod) => {
			highlighter().loadLanguageSync(mod.default);
			loadCount += 1;
			for (const listener of listeners) listener();
		});
	}
	return false;
}
setTimeout(() => {
	highlighter();
}, 0).unref?.();
/**
* Highlight `code` into shiki's HTML (a single `<pre class="shiki">` tree)
* when `lang` maps to a registered grammar; `undefined` means the caller
* renders its plain fallback. A lazy grammar not yet loaded returns `undefined`
* for this call and loads in the background; subscribe with
* {@link onGrammarLoaded} to re-highlight once it registers.
* @param code - the source text.
* @param lang - the language hint (a markdown fence info string or a fixed caller id).
* @returns the highlighted HTML, or `undefined` for unknown or not-yet-loaded languages.
*/
function highlightToHtml(code, lang) {
	const resolved = grammarForHint(lang);
	if (resolved === void 0) return void 0;
	if (!ensureGrammar(resolved)) return void 0;
	return highlighter().codeToHtml(code, {
		lang: resolved,
		theme: "css-variables"
	});
}
/** vscode-textmate FontStyle bits shiki folds into `text-decoration` values. */
const DECORATION_BITS = [[4, "underline"], [8, "line-through"]];
/**
* The inline style shiki's HTML arm assigns one token (`getTokenStyleObject`
* mirrored onto React style keys): the css-variables color plus the
* vscode-textmate font-style bits the theme lets through — italic (1), bold
* (2), and the {@link DECORATION_BITS} decorations (the theme injects bold,
* italic, and underline rules for markup scopes, so markdown fences carry
* them). The theme has no per-scope backgrounds, so `background-color` never
* occurs; the arm-parity tests fail loud if a shiki upgrade changes that.
*/
function spanStyle(token) {
	const style = { color: token.color };
	/* v8 ignore next -- fontStyle is optional in ThemedToken's type; tokenizeWithTheme always stamps it. */
	const bits = token.fontStyle ?? 0;
	if ((bits & 1) !== 0) style.fontStyle = "italic";
	if ((bits & 2) !== 0) style.fontWeight = "bold";
	const decorations = DECORATION_BITS.filter(([bit]) => (bits & bit) !== 0);
	if (decorations.length > 0) style.textDecoration = decorations.map(([, value]) => value).join(" ");
	return style;
}
/**
* Narrow one tokenized line to the runs a `<span style>` renders, folding a
* whitespace-only run into the token that follows it — shiki's default
* `mergeWhitespaces` HTML behavior — with each run styled through
* {@link spanStyle}, so the streaming spans and the settled `codeToHtml`
* swap render one identical span tree. shiki exempts underlined/struck
* whitespace from the fold; under the css-variables theme that case cannot
* occur — its only underline rule styles inline-link scopes, whose spaced
* text tokenizes as one run, and it injects no strikethrough rule — so the
* unconditional fold here stays equivalent (the markdown arm-parity test
* pins it). A line-trailing whitespace-only run has no follower and keeps
* its own span, as in shiki.
*/
function lineSpans(line) {
	const spans = [];
	let pendingWhitespace = "";
	for (const [index, token] of line.entries()) {
		if (/^\s+$/.test(token.content) && index + 1 < line.length) {
			pendingWhitespace += token.content;
			continue;
		}
		spans.push({
			text: pendingWhitespace + token.content,
			style: spanStyle(token)
		});
		pendingWhitespace = "";
	}
	return spans;
}
/**
* Incremental highlighter for one growing streaming fence. TextMate
* tokenization is line-based and forward-only — a line's tokens depend only on
* its own text and the grammar state entering it — so appended text never
* changes a completed line's tokens. The session caches the spans of every
* completed line together with the grammar state after them;
* {@link updateFrame} reports only newly completed lines plus the still-growing
* last line, while {@link update} materializes the complete compatibility
* result. Per-call tokenization cost therefore excludes the completed prefix,
* and the result equals a from-scratch tokenization of the same code.
* Non-append input and a change of resolved grammar reset the cache and
* re-tokenize fully, so any input stays correct.
*/
var StreamingHighlightSession = class {
	/** Grammar id the cache was built with; a different resolution resets it. */
	resolved;
	/** Newline-terminated source prefix covered by {@link spans}. */
	prefix = "";
	/** Cached spans, one entry per completed line of {@link prefix}. */
	spans = [];
	/** Grammar state after {@link prefix}; undefined = the grammar's initial state. */
	state;
	lastCode;
	lastLang;
	lastResult;
	generation = 0;
	lastFrame;
	reset(resolved) {
		this.resolved = resolved;
		this.prefix = "";
		this.spans = [];
		this.state = void 0;
		this.generation += 1;
		this.lastFrame = void 0;
	}
	/** Tokenize `text` with `resolved`, resuming from the cached grammar state when one exists. */
	tokenize(resolved, text) {
		return highlighter().codeToTokensBase(text, {
			lang: resolved,
			theme: "css-variables",
			...this.state === void 0 ? {} : { grammarState: this.state }
		});
	}
	/**
	* Tokenize one update as a delta for a retained renderer.
	* @param code - the fence text accumulated so far.
	* @param lang - the language hint.
	* @returns Newly completed lines plus the current tail, or `undefined` for the plain arm.
	*/
	updateFrame(code, lang) {
		if (code === this.lastCode && lang === this.lastLang && this.lastFrame !== void 0) return this.lastFrame;
		this.lastCode = code;
		this.lastLang = lang;
		this.lastResult = void 0;
		const resolved = grammarForHint(lang);
		if (resolved === void 0 || !ensureGrammar(resolved)) {
			this.reset(void 0);
			return;
		}
		if (resolved !== this.resolved || !code.startsWith(this.prefix)) this.reset(resolved);
		const firstNewLine = this.spans.length;
		const rest = code.slice(this.prefix.length);
		const lastNewline = rest.lastIndexOf("\n");
		if (lastNewline >= 0) {
			const grownEnd = rest[lastNewline - 1] === "\r" ? lastNewline - 1 : lastNewline;
			const tokens = this.tokenize(resolved, rest.slice(0, grownEnd));
			for (const line of tokens) this.spans.push(lineSpans(line));
			this.state = highlighter().getLastGrammarState(tokens);
			this.prefix = code.slice(0, this.prefix.length + lastNewline + 1);
		}
		this.lastFrame = {
			generation: this.generation,
			appended: this.spans.slice(firstNewLine),
			tail: this.tokenize(resolved, rest.slice(lastNewline + 1)).map(lineSpans)
		};
		return this.lastFrame;
	}
	/**
	* Tokenize the fence's current text into per-line highlighted runs;
	* `undefined` means the caller renders its plain fallback. Idempotent per
	* (`code`, `lang`) input — repeated calls return the identical result array —
	* and a retained line keeps its span-array identity across growing calls, so
	* a React caller can reuse cached line elements. A lazy grammar not yet
	* loaded returns `undefined` and loads in the background exactly as
	* {@link highlightToHtml} does; the next call after it registers highlights.
	* @param code - the fence text accumulated so far (display-trimmed, no synthetic trailing newline).
	* @param lang - the language hint (a markdown fence info string).
	* @returns one entry per line of `code` (each an array of runs), or `undefined` for unknown or not-yet-loaded languages.
	*/
	update(code, lang) {
		if (code === this.lastCode && lang === this.lastLang && this.lastResult !== void 0) return this.lastResult;
		const frame = this.updateFrame(code, lang);
		if (frame === void 0) return void 0;
		this.lastResult = [...this.spans, ...frame.tail];
		return this.lastResult;
	}
};
/**
* Tokenize `code` into per-line highlighted runs when `lang` maps to a
* registered grammar; `undefined` means the caller renders its plain fallback.
* A line-numbered view needs the token runs split per line (one gutter number
* per line), which the single-`<pre>` {@link highlightToHtml} does not expose,
* so this returns shiki's own 2D line/token structure narrowed to what a run
* renders. Each run's color is a `--shiki-*` custom property, keeping token
* colors on the theme package's sheets exactly as the HTML path does; the
* markup font-style bits the theme lets through (bold/italic/underline in
* markdown scopes) are dropped — the line-numbered file view renders
* color-only runs. The trailing newline shiki appends as a final empty line
* is dropped so the run count matches the caller's own line array.
* @param code - the source text.
* @param lang - the language hint (a file-extension-derived language id).
* @returns one entry per source line (each an array of runs), or `undefined` for unknown or not-yet-loaded languages.
*/
function highlightLines(code, lang) {
	const resolved = grammarForHint(lang);
	if (resolved === void 0) return void 0;
	if (!ensureGrammar(resolved)) return void 0;
	const { tokens } = highlighter().codeToTokens(code, {
		lang: resolved,
		theme: "css-variables"
	});
	const last = tokens[tokens.length - 1];
	return (tokens.length > 1 && last !== void 0 && last.length === 0 ? tokens.slice(0, -1) : tokens).map((line) => line.map((token) => ({
		text: token.content,
		style: { color: token.color }
	})));
}
//#endregion
//#region lib/types/code-highlighting.js
/** Shared filename-to-grammar selection and lazy line highlighter for source views. */
/**
* Bind the shared lazy highlighter to one language and refresh after its grammar loads.
* @param language - grammar hint selected from the source filename.
* @returns a stable fragment highlighter; unknown and loading grammars return `undefined` for plain-text fallback.
*/
function useCodeHighlighter(language) {
	return useCallback((code) => highlightLines(code, language), [language, useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount)]);
}
//#endregion
//#region lib/types/relative-time.js
/**
* Compact relative-time bucketing shared by every surface that dates a
* session. Bucketing is here so two surfaces naming the same session agree;
* the words stay in each plugin's own dictionary, per locale-owned copy.
*
* @module @deepseek-ai/dsh-client-ui-primitives/relative-time
*/
/**
* Compact relative time, as a structured bucket the renderer localizes
* ("now"/"5min"/"3h"/"2d"/"4mo"/"1y" in en).
* @param at - epoch ms of the dated moment.
* @param now - current epoch ms (injected for pure rendering).
* @returns the row's trailing time bucket and magnitude.
*/
function relativeTime(at, now) {
	const MIN = 6e4;
	const HOUR = 36e5;
	const DAY = 864e5;
	const diff = Math.max(0, now - at);
	if (diff < MIN) return {
		unit: "now",
		n: 0
	};
	if (diff < HOUR) return {
		unit: "minutes",
		n: Math.floor(diff / MIN)
	};
	if (diff < DAY) return {
		unit: "hours",
		n: Math.floor(diff / HOUR)
	};
	if (diff < 30 * DAY) return {
		unit: "days",
		n: Math.floor(diff / DAY)
	};
	if (diff < 365 * DAY) return {
		unit: "months",
		n: Math.floor(diff / (30 * DAY))
	};
	return {
		unit: "years",
		n: Math.floor(diff / (365 * DAY))
	};
}
//#endregion
//#region lib/types/rank-by-name.js
/**
* Shared ranking for `/` menu candidates: the query must be a
* case-insensitive ordered subsequence of the candidate name or, when the
* candidate carries one, of its display label (a localized title). Prefix
* hits rank first, then the strongest alignment score over either key, then
* the source order of the input. Decision record:
* .agents/notes/archived/feature/2026-08-04-web-slash-command-fuzzy-discovery.md
*/
/** Extra weight for name starts and separator boundaries. */
function boundaryBonus(name, index) {
	return index === 0 || name.charAt(index - 1) === "-" || name.charAt(index - 1) === "_" ? 8 : 0;
}
/**
* Score the strongest ordered-subsequence alignment in O(name × query).
* Boundary and adjacent matches earn weight; skipped and leading characters
* cost weight. Undefined when the query is not a subsequence of the name.
*/
function alignmentScore(name, query) {
	if (query.length > name.length) return void 0;
	const noMatch = Number.NEGATIVE_INFINITY;
	let previous = Array(name.length).fill(noMatch);
	for (let index = 0; index < name.length; index++) if (name.charAt(index) === query.charAt(0)) previous[index] = 1 + boundaryBonus(name, index) - index;
	for (let queryIndex = 1; queryIndex < query.length; queryIndex++) {
		const current = Array(name.length).fill(noMatch);
		let left = noMatch;
		let leftLeft = noMatch;
		let bestGapped = noMatch;
		for (const [index, prior] of previous.entries()) {
			if (leftLeft !== noMatch) bestGapped = Math.max(bestGapped, leftLeft + index - 2);
			if (name.charAt(index) === query.charAt(queryIndex)) {
				const bonus = 1 + boundaryBonus(name, index);
				let score = noMatch;
				if (left !== noMatch) score = left + bonus + 4;
				if (bestGapped !== noMatch) score = Math.max(score, bestGapped + bonus + 1 - index);
				current[index] = score;
			}
			leftLeft = left;
			left = prior;
		}
		previous = current;
	}
	let best = noMatch;
	for (const score of previous) best = Math.max(best, score);
	return best === noMatch ? void 0 : best;
}
/**
* Rank named items by a menu query.
* @param items - candidates in source order (a host catalog, then client
* contributions); an item's optional `label` is a second search key beside
* its name.
* @param rawQuery - the text typed after the trigger, matched case-insensitively.
* @returns the matching items: prefix hits first, then by alignment score,
* then in source order. The input list itself for an empty query.
*/
function rankByName(items, rawQuery) {
	const query = rawQuery.toLowerCase();
	if (query === "") return items;
	const ranked = [];
	items.forEach((item, index) => {
		const keys = item.label === void 0 ? [item.name] : [item.name, item.label];
		let prefix = false;
		let score;
		for (const key of keys) {
			const lower = key.toLowerCase();
			const keyScore = alignmentScore(lower, query);
			if (keyScore === void 0) continue;
			prefix ||= lower.startsWith(query);
			score = score === void 0 ? keyScore : Math.max(score, keyScore);
		}
		if (score !== void 0) ranked.push({
			item,
			index,
			prefix,
			score
		});
	});
	ranked.sort((left, right) => Number(right.prefix) - Number(left.prefix) || right.score - left.score || left.index - right.index);
	return ranked.map((match) => match.item);
}
//#endregion
//#region lib/types/darwin-desktop.js
/** macOS desktop detection for hiddenInset-titlebar layout variants. */
/**
* Whether the client runs in the macOS desktop shell: the Electron preload
* marks `<html>` with `data-platform="darwin"`; plain web never sets it.
* Read at render time — the mark may arrive as late as DOMContentLoaded.
* @returns true only inside the macOS Electron shell.
*/
function isDarwinDesktop() {
	return document.documentElement.dataset.platform === "darwin";
}
//#endregion
//#region lib/types/JsonTree.js
const OBJECT_PREVIEW_LIMIT = 4;
const ARRAY_PREVIEW_LIMIT = 5;
const PREVIEW_DEPTH_LIMIT = 2;
function valueCopyMenuItems(labels) {
	return [
		{
			id: "value",
			label: labels.copyValue
		},
		{
			id: "json",
			label: labels.copyJson
		},
		{
			id: "path",
			label: labels.copyPath
		}
	];
}
function objectCopyMenuItems(labels) {
	return [
		{
			id: "prettyJson",
			label: labels.copyPrettyJson
		},
		{
			id: "json",
			label: labels.copyCompactJson
		},
		{
			id: "path",
			label: labels.copyPath
		}
	];
}
/** Notify only the old and new row actions; JSON values do not subscribe to hover state. */
function createCopyStore() {
	let current;
	const listeners = /* @__PURE__ */ new Map();
	return {
		get: () => current,
		set(next) {
			const previous = current?.id;
			current = next;
			for (const id of new Set([previous, next?.id])) {
				if (id === void 0) continue;
				for (const listener of listeners.get(id) ?? []) listener();
			}
		},
		subscribe(id, listener) {
			let row = listeners.get(id);
			if (row === void 0) listeners.set(id, row = /* @__PURE__ */ new Set());
			row.add(listener);
			return () => {
				row.delete(listener);
				if (row.size === 0) listeners.delete(id);
			};
		}
	};
}
function JsonCopyAction({ store, target, persistent, labels, onCopy, onClose }) {
	const id = pathId(target.path);
	const subscribe = useCallback((listener) => store.subscribe(id, listener), [id, store]);
	const getSnapshot = () => {
		const current = store.get();
		return current?.id === id ? current : void 0;
	};
	const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const buttonRef = useRef(null);
	const state = snapshot?.state ?? "idle";
	const object = typeof target.value === "object" && target.value !== null;
	const copyTitle = state === "copied" ? labels.copied : state === "failed" ? labels.copyFailed : object ? labels.copyPrettyJson : labels.copyValue;
	return jsx("span", {
		className: css$26.copySlot,
		children: (persistent || snapshot !== void 0) && jsx(Menu, {
			open: snapshot?.menuOpen === true,
			compact: true,
			portal: true,
			align: "end",
			anchor: jsx("button", {
				ref: buttonRef,
				type: "button",
				className: css$26.actionButton,
				"data-json-copy-button": true,
				"data-state": state,
				"aria-label": copyTitle,
				title: labels.copyButtonTitle(copyTitle),
				onClick: () => void onCopy(target, object ? "prettyJson" : "value"),
				onContextMenu: (event) => {
					event.preventDefault();
					event.stopPropagation();
					store.set({
						id,
						target,
						state,
						menuOpen: true
					});
				},
				children: state === "copied" ? jsx(IconCheckOutlineRegular, { size: 12 }) : jsx(IconCopyOutlineRegular, { size: 12 })
			}),
			items: object ? objectCopyMenuItems(labels) : valueCopyMenuItems(labels),
			onSelect: (mode) => {
				onCopy(target, mode);
			},
			onClose,
			getAnchorRect: () => buttonRef.current.getBoundingClientRect()
		})
	});
}
function isExpandableValue(value) {
	return typeof value === "object" && value !== null && !(value instanceof Date);
}
function entriesOf(value) {
	if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
	return Object.keys(value).map((key) => [key, value[key]]);
}
function bracketOf(value) {
	return Array.isArray(value) ? ["[", "]"] : ["{", "}"];
}
function previewPrimitive(value) {
	if (value === null) return jsx("span", {
		className: css$26.keywordValue,
		children: "null"
	});
	if (typeof value === "string") return jsx("span", {
		className: css$26.stringValue,
		children: JSON.stringify(value)
	});
	if (typeof value === "number") return jsx("span", {
		className: css$26.numberValue,
		children: String(value)
	});
	if (typeof value === "boolean") return jsx("span", {
		className: css$26.keywordValue,
		children: String(value)
	});
	if (typeof value === "bigint") return jsx("span", {
		className: css$26.otherValue,
		children: value.toString()
	});
	if (typeof value === "undefined") return jsx("span", {
		className: css$26.otherValue,
		children: "undefined"
	});
	if (typeof value === "symbol") return jsx("span", {
		className: css$26.otherValue,
		children: value.description ?? "Symbol"
	});
	if (typeof value === "function") return jsx("span", {
		className: css$26.otherValue,
		children: value.name || "Function"
	});
	return null;
}
function previewValue(value, depth) {
	if (!isExpandableValue(value)) return previewPrimitive(value);
	const array = Array.isArray(value);
	const entries = entriesOf(value);
	const limit = array ? ARRAY_PREVIEW_LIMIT : OBJECT_PREVIEW_LIMIT;
	const visible = entries.slice(0, limit);
	const [open, close] = bracketOf(value);
	return jsxs(Fragment, { children: [
		jsx("span", {
			className: css$26.punctuation,
			children: open
		}),
		depth >= PREVIEW_DEPTH_LIMIT ? jsx("span", {
			className: css$26.previewEllipsis,
			children: "…"
		}) : visible.map(([key, item], index) => jsxs("span", { children: [
			index > 0 && jsx("span", {
				className: css$26.punctuation,
				children: ", "
			}),
			!array && jsxs(Fragment, { children: [jsx("span", {
				className: css$26.previewProperty,
				children: key
			}), jsx("span", {
				className: css$26.punctuation,
				children: ": "
			})] }),
			previewValue(item, depth + 1)
		] }, key)),
		depth < PREVIEW_DEPTH_LIMIT && entries.length > limit && jsx("span", {
			className: css$26.previewEllipsis,
			children: ", …"
		}),
		jsx("span", {
			className: css$26.punctuation,
			children: close
		})
	] });
}
function primitiveValue(value) {
	if (value === null) return jsx("span", {
		className: css$26.keywordValue,
		children: "null"
	});
	if (typeof value === "string") return jsx("span", {
		className: css$26.stringValue,
		children: JSON.stringify(value)
	});
	if (typeof value === "boolean") return jsx("span", {
		className: css$26.keywordValue,
		children: String(value)
	});
	if (typeof value === "number") return jsx("span", {
		className: css$26.numberValue,
		children: String(value)
	});
	if (typeof value === "bigint") return jsx("span", {
		className: css$26.numberValue,
		children: `${value.toString()}n`
	});
	if (value instanceof Date) return jsx("span", {
		className: css$26.otherValue,
		children: value.toISOString()
	});
	if (typeof value === "function") return jsxs("span", {
		className: css$26.otherValue,
		children: ["function() ", "{ }"]
	});
	if (typeof value === "undefined") return jsx("span", {
		className: css$26.otherValue,
		children: "undefined"
	});
	return jsx("span", {
		className: css$26.otherValue,
		children: value.toString()
	});
}
function fieldText(field) {
	return field === "" ? "\"\"" : field;
}
function pathId(path) {
	return path.map((part) => typeof part === "number" ? `n${String(part)}` : `s${String(part.length)}:${part}`).join("/");
}
function claimFocus(button) {
	button.focus();
}
function moveFocus(button, direction) {
	const tree = button.closest("[role=\"tree\"]");
	/* v8 ignore next -- JsonTree attaches expander handlers only beneath its owning role=tree. */
	if (tree === null) return;
	const expanders = Array.from(tree.querySelectorAll("[data-json-expander]"));
	const current = expanders.indexOf(button);
	/* v8 ignore next -- the current expander is a member of the queried non-empty set. */
	if (current < 0 || expanders.length === 0) return;
	const nextExpander = expanders[(current + direction + expanders.length) % expanders.length];
	/* v8 ignore next -- modulo over the non-empty expander set always resolves a member. */
	if (nextExpander !== void 0) claimFocus(nextExpander);
}
function NodeField({ field, expandable, onToggle }) {
	if (field === void 0) return null;
	return jsxs("span", {
		className: clsx(css$26.label, expandable && css$26.clickableLabel),
		onClick: expandable ? onToggle : void 0,
		children: [fieldText(field), ":"]
	});
}
function JsonString({ collapsedStringLines, stringWrapping, field, labels, lastElement, renderCopy, value }) {
	const contentsId = useId();
	const contentRef = useRef(null);
	const rawRef = useRef(null);
	const [expanded, setExpanded] = useState(false);
	const [wrapped, setWrapped] = useState(false);
	const [truncated, setTruncated] = useState(false);
	useLayoutEffect(() => {
		if (expanded) return;
		const content = contentRef.current;
		const measure = () => {
			const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight);
			setTruncated(content.scrollHeight > lineHeight * collapsedStringLines);
		};
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(content);
		return () => {
			observer.disconnect();
		};
	}, [
		collapsedStringLines,
		expanded,
		field,
		lastElement,
		value
	]);
	useLayoutEffect(() => {
		if (!expanded) return;
		const raw = rawRef.current;
		const clips = [];
		const tree = raw.closest(`.${css$26.root}`);
		for (let parent = tree.parentElement; parent !== null; parent = parent.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)) clips.push(parent);
		const measure = () => {
			let top = 0;
			let bottom = window.innerHeight;
			for (const clip of clips) {
				const rect = clip.getBoundingClientRect();
				const style = getComputedStyle(clip);
				top = Math.max(top, rect.top + clip.clientTop);
				bottom = Math.min(bottom, rect.top + clip.clientTop + clip.clientHeight - Number.parseFloat(style.paddingBottom));
			}
			const available = bottom - Math.max(top, raw.getBoundingClientRect().top);
			raw.style.maxHeight = `${Math.max(16, available - 4)}px`;
		};
		measure();
		const observer = typeof ResizeObserver === "undefined" ? void 0 : new ResizeObserver(measure);
		observer?.observe(raw);
		for (const clip of clips) observer?.observe(clip);
		window.addEventListener("resize", measure);
		window.addEventListener("scroll", measure, true);
		return () => {
			observer?.disconnect();
			window.removeEventListener("resize", measure);
			window.removeEventListener("scroll", measure, true);
		};
	}, [expanded, value]);
	if (expanded) {
		const fieldId = `${contentsId}-field`;
		return jsxs("div", {
			className: css$26.stringField,
			"data-expanded": true,
			children: [
				field !== void 0 && jsxs("span", {
					id: fieldId,
					className: css$26.label,
					children: [fieldText(field), ":"]
				}),
				jsx("pre", {
					ref: rawRef,
					id: contentsId,
					className: css$26.stringRaw,
					"data-wrap": wrapped,
					tabIndex: 0,
					"aria-labelledby": field === void 0 ? void 0 : fieldId,
					children: value
				}),
				!lastElement && jsx("span", {
					className: css$26.punctuation,
					children: ","
				}),
				jsxs("div", {
					className: css$26.stringActions,
					children: [
						stringWrapping !== void 0 && jsx("button", {
							type: "button",
							className: css$26.actionButton,
							"aria-label": stringWrapping.label,
							title: stringWrapping.label,
							"aria-pressed": wrapped,
							"aria-controls": contentsId,
							onClick: () => {
								const next = !wrapped;
								setWrapped(next);
								stringWrapping.setDefault(next);
							},
							children: jsx(IconWrapLinesOutlineRegular, { size: 12 })
						}),
						jsx("button", {
							type: "button",
							className: css$26.actionButton,
							"aria-label": labels.collapseNode,
							title: labels.collapseNode,
							"aria-expanded": true,
							"aria-controls": contentsId,
							onClick: () => {
								setExpanded(false);
							},
							children: jsx("svg", {
								width: "12",
								height: "12",
								viewBox: "0 0 16 16",
								fill: "none",
								stroke: "currentColor",
								"aria-hidden": "true",
								children: jsx("path", { d: "M9.5 1.5V6.5H14.5M1.5 9.5H6.5V14.5" })
							})
						}),
						renderCopy?.(true)
					]
				})
			]
		});
	}
	return jsxs(Fragment, { children: [renderCopy?.(), jsx("span", {
		className: css$26.stringField,
		"data-expanded": expanded,
		children: jsxs("span", {
			ref: contentRef,
			id: contentsId,
			className: css$26.stringText,
			children: [
				truncated && jsx("span", {
					className: css$26.stringToggleSlot,
					children: jsxs("button", {
						type: "button",
						className: css$26.stringToggle,
						"aria-label": labels.expandNode,
						"aria-expanded": false,
						"aria-controls": contentsId,
						onClick: () => {
							setWrapped(stringWrapping?.getDefault() ?? false);
							setExpanded(true);
						},
						children: [jsx("span", {
							"aria-hidden": "true",
							children: "…"
						}), labels.expandNode]
					})
				}),
				field !== void 0 && jsxs("span", {
					className: css$26.label,
					children: [fieldText(field), ":"]
				}),
				primitiveValue(value),
				!lastElement && jsx("span", {
					className: css$26.punctuation,
					children: ","
				})
			]
		})
	})] });
}
function JsonTreeNode({ collapsedStringLines, stringWrapping, field, initialExpanded, labels, lastElement, onClaimTabStop, onRowHover, path, renderCopy, tabStopId, value }) {
	const contentsId = useId();
	const expanderRef = useRef(null);
	const [expanded, setExpanded] = useState(initialExpanded);
	const nodeId = pathId(path);
	const container = isExpandableValue(value);
	const entries = container ? entriesOf(value) : [];
	const expandable = entries.length > 0;
	const toggle = () => {
		setExpanded((current) => !current);
		claimFocus(expanderRef.current);
	};
	const onExpanderKeyDown = (event) => {
		if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
			event.preventDefault();
			setExpanded(event.key === "ArrowRight");
			return;
		}
		if (event.key === "ArrowUp" || event.key === "ArrowDown") {
			event.preventDefault();
			moveFocus(event.currentTarget, event.key === "ArrowUp" ? -1 : 1);
		}
	};
	const row = (children, ariaExpanded) => jsxs("div", {
		className: css$26.row,
		role: "treeitem",
		"aria-expanded": ariaExpanded,
		onMouseOver: (event) => {
			event.stopPropagation();
			onRowHover(event.currentTarget, {
				path,
				value
			});
		},
		children: [typeof value !== "string" && renderCopy?.({
			path,
			value
		}), children]
	});
	if (typeof value === "string") return row(jsx(JsonString, {
		collapsedStringLines,
		stringWrapping,
		field,
		value,
		labels,
		lastElement,
		renderCopy: renderCopy === void 0 ? void 0 : (persistent) => renderCopy({
			path,
			value
		}, persistent)
	}));
	if (!container) return row(jsxs(Fragment, { children: [
		jsx(NodeField, {
			field,
			expandable: false,
			onToggle: toggle
		}),
		primitiveValue(value),
		!lastElement && jsx("span", {
			className: css$26.punctuation,
			children: ","
		})
	] }));
	const [open, close] = bracketOf(value);
	if (!expandable) return row(jsxs(Fragment, { children: [
		jsx(NodeField, {
			field,
			expandable: false,
			onToggle: toggle
		}),
		jsx("span", {
			className: css$26.punctuation,
			children: open
		}),
		jsx("span", {
			className: css$26.punctuation,
			children: close
		}),
		!lastElement && jsx("span", {
			className: css$26.punctuation,
			children: ","
		})
	] }));
	return row(jsxs(Fragment, { children: [
		jsx("span", {
			ref: expanderRef,
			className: clsx(css$26.expander, expanded ? css$26.collapseIcon : css$26.expandIcon),
			"data-json-expander": true,
			role: "button",
			"aria-label": expanded ? labels.collapseNode : labels.expandNode,
			"aria-expanded": expanded,
			"aria-controls": expanded ? contentsId : void 0,
			tabIndex: tabStopId === nodeId ? 0 : -1,
			onFocus: () => {
				onClaimTabStop(nodeId);
			},
			onClick: toggle,
			onKeyDown: onExpanderKeyDown
		}),
		jsxs("span", {
			className: css$26.summary,
			children: [
				jsx(NodeField, {
					field,
					expandable: true,
					onToggle: toggle
				}),
				jsx("span", {
					className: css$26.preview,
					children: previewValue(value, 0)
				}),
				!lastElement && jsx("span", {
					className: css$26.punctuation,
					children: ","
				})
			]
		}),
		expanded && jsx("ul", {
			id: contentsId,
			role: "group",
			className: css$26.children,
			children: entries.map(([key, item], index) => jsx(JsonTreeNode, {
				collapsedStringLines,
				stringWrapping,
				field: key,
				value: item,
				path: [...path, Array.isArray(value) ? index : key],
				labels,
				lastElement: index === entries.length - 1,
				initialExpanded: false,
				tabStopId,
				onClaimTabStop,
				onRowHover,
				renderCopy
			}, key))
		})
	] }), expanded);
}
function formattedPath(path) {
	return path.reduce((result, part) => {
		if (typeof part === "number") return `${result}[${String(part)}]`;
		return /^[A-Za-z_$][\w$]*$/.test(part) ? `${result}.${part}` : `${result}[${JSON.stringify(part)}]`;
	}, "$");
}
function copyText$2(target, mode) {
	if (mode === "path") return formattedPath(target.path);
	if (mode === "prettyJson") return JSON.stringify(target.value, null, 2);
	if (mode === "json") return JSON.stringify(target.value);
	if (typeof target.value === "string") return target.value;
	if (typeof target.value === "undefined") return "undefined";
	if (typeof target.value === "bigint") return target.value.toString();
	if (typeof target.value === "symbol") return target.value.description ?? "Symbol";
	if (typeof target.value === "function") return target.value.name || "Function";
	return JSON.stringify(target.value);
}
/**
* Render parsed JSON as a compact, keyboard-accessible inspector tree.
* @param props - Parsed data, accessible label, and display options.
* @returns A read-only JSON tree with an optionally fixed-open top level.
*/
function JsonTree({ data, label, className, collapsedStringLines = 3, stringWrapping, copyable = true, expandTopLevel = true, labels }) {
	const rootEntries = entriesOf(data);
	const firstExpandableIndex = rootEntries.findIndex(([, value]) => isExpandableValue(value) && entriesOf(value).length > 0);
	const firstExpandableEntry = rootEntries[firstExpandableIndex];
	const initialTabStopId = expandTopLevel ? firstExpandableEntry === void 0 ? null : pathId([Array.isArray(data) ? firstExpandableIndex : firstExpandableEntry[0]]) : isExpandableValue(data) && rootEntries.length > 0 ? pathId([]) : null;
	const activeRowRef = useRef();
	const resetTimer = useRef();
	const copySequence = useRef(0);
	const [copyStore] = useState(createCopyStore);
	const [tabStopId, setTabStopId] = useState(initialTabStopId);
	const setActiveRow = (row) => {
		activeRowRef.current?.removeAttribute("data-json-copy-active");
		activeRowRef.current = row;
		row?.setAttribute("data-json-copy-active", "");
	};
	const clearCopyTarget = () => {
		copySequence.current += 1;
		if (resetTimer.current !== void 0) clearTimeout(resetTimer.current);
		setActiveRow(void 0);
		copyStore.set(void 0);
	};
	useEffect(() => () => {
		copySequence.current += 1;
		if (resetTimer.current !== void 0) clearTimeout(resetTimer.current);
		activeRowRef.current?.removeAttribute("data-json-copy-active");
	}, []);
	useEffect(() => {
		clearCopyTarget();
		setTabStopId(initialTabStopId);
	}, [
		data,
		expandTopLevel,
		initialTabStopId
	]);
	const handleRowHover = (row, target) => {
		if (!copyable || copyStore.get()?.menuOpen) return;
		if (activeRowRef.current === row) return;
		setActiveRow(row);
		copyStore.set({
			id: pathId(target.path),
			target,
			state: "idle",
			menuOpen: false
		});
	};
	const handleRootMouseOver = (event) => {
		if (!copyable || copyStore.get()?.menuOpen) return;
		/* v8 ignore next -- browser mouse events delivered through React target an Element. */
		if (!(event.target instanceof Element)) return;
		if (event.target.closest("[data-json-copy-button]") === null) clearCopyTarget();
	};
	const copy = async (target, mode) => {
		const sequence = ++copySequence.current;
		const snapshot = {
			id: pathId(target.path),
			target,
			state: "idle",
			menuOpen: false
		};
		copyStore.set(snapshot);
		let state;
		try {
			await navigator.clipboard.writeText(copyText$2(target, mode));
			state = "copied";
		} catch {
			state = "failed";
		}
		const current = copyStore.get();
		if (sequence !== copySequence.current || current?.target !== target) return;
		copyStore.set({
			...current,
			state
		});
		if (resetTimer.current !== void 0) clearTimeout(resetTimer.current);
		resetTimer.current = setTimeout(() => {
			const current = copyStore.get();
			if (current?.target === target) copyStore.set({
				...current,
				state: "idle"
			});
		}, 1500);
	};
	const [rootOpen, rootClose] = bracketOf(data);
	const renderCopy = copyable ? (target, persistent = false) => jsx(JsonCopyAction, {
		store: copyStore,
		target,
		persistent,
		labels,
		onCopy: copy,
		onClose: clearCopyTarget
	}) : void 0;
	return jsx("div", {
		className: clsx(css$26.root, className),
		style: { "--json-tree-collapsed-lines": collapsedStringLines },
		onMouseOver: handleRootMouseOver,
		onMouseLeave: () => {
			if (!copyStore.get()?.menuOpen) clearCopyTarget();
		},
		children: expandTopLevel ? jsxs("div", {
			className: css$26.expandedTopLevel,
			children: [
				jsxs("div", {
					className: clsx(css$26.row, css$26.topLevelBracket),
					"data-json-root-row": true,
					onMouseOver: (event) => {
						event.stopPropagation();
						handleRowHover(event.currentTarget, {
							path: [],
							value: data
						});
					},
					children: [renderCopy?.({
						path: [],
						value: data
					}), jsx("span", {
						className: css$26.punctuation,
						children: rootOpen
					})]
				}),
				jsx("div", {
					"aria-label": label,
					className: clsx(css$26.container, css$26.expandedTopLevelContainer),
					role: "tree",
					children: rootEntries.map(([key, value], index) => jsx(JsonTreeNode, {
						collapsedStringLines,
						stringWrapping,
						field: key,
						value,
						path: [Array.isArray(data) ? index : key],
						labels,
						lastElement: index === rootEntries.length - 1,
						initialExpanded: false,
						tabStopId,
						onClaimTabStop: setTabStopId,
						onRowHover: handleRowHover,
						renderCopy
					}, key))
				}),
				jsx("div", {
					className: clsx(css$26.row, css$26.topLevelBracket),
					children: jsx("span", {
						className: css$26.punctuation,
						children: rootClose
					})
				})
			]
		}) : jsx("div", {
			"aria-label": label,
			className: css$26.container,
			role: "tree",
			children: jsx(JsonTreeNode, {
				collapsedStringLines,
				stringWrapping,
				value: data,
				path: [],
				labels,
				lastElement: true,
				initialExpanded: true,
				tabStopId,
				onClaimTabStop: setTabStopId,
				onRowHover: handleRowHover,
				renderCopy
			})
		})
	});
}
//#endregion
//#region lib/types/ansi.js
/**
* The 8/16 basic ANSI colors, keyed by the whitespace-free `r,g,b` triple
* anser emits for them, mapped onto the theme tokens that carry the same
* semantic. Black and white both resolve to the primary label color so text
* stays legible under either theme instead of matching the surface it sits
* on; bright black takes the tertiary label color (the muted-gray role).
* Cyan and bright cyan take two static blues: the design system has no cyan,
* and anser's literal bright cyan is unreadable on the light theme's code
* surface. Magenta has no token equivalent and falls through to anser's
* literal rgb, as do all 256-palette and truecolor values.
*/
const TOKEN_BY_BASIC_RGB = {
	"0,0,0": "var(--dsw-alias-label-primary)",
	"255,255,255": "var(--dsw-alias-label-primary)",
	"85,85,85": "var(--dsw-alias-label-tertiary)",
	"187,0,0": "var(--dsw-alias-state-error-primary)",
	"255,85,85": "var(--dsw-alias-state-error-secondary)",
	"0,187,0": "var(--dsw-alias-state-success-primary)",
	"0,255,0": "var(--dsw-alias-state-success-secondary)",
	"187,187,0": "var(--dsw-alias-state-warn-primary)",
	"255,255,85": "var(--dsw-alias-state-warn-secondary)",
	"0,0,187": "var(--dsw-alias-state-business-primary)",
	"85,85,255": "var(--dsw-static-blue-400)",
	"0,187,187": "var(--dsw-static-blue-600)",
	"85,255,255": "var(--dsw-static-blue-500)"
};
/**
* CSS for each SGR attribute anser reports. `blink` is deliberately absent —
* animated text is not reproduced. `reverse` never arrives here: anser
* consumes it by swapping the run's foreground and background. Underline and
* strikethrough share `textDecoration`, so in a run declaring both, the
* later declaration wins.
*/
const STYLE_BY_DECORATION = {
	bold: { fontWeight: 700 },
	dim: { opacity: .7 },
	italic: { fontStyle: "italic" },
	underline: { textDecoration: "underline" },
	strikethrough: { textDecoration: "line-through" },
	hidden: { visibility: "hidden" }
};
/** OSC strings (window title, hyperlinks), with or without their terminator. */
const OSC_SEQUENCE = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g;
/** Escape sequences other than CSI: charset selection, single-shift, reset. */
const NON_CSI_ESCAPE = /\u001b(?!\[)[\u0020-\u002f]*[\u0030-\u007e]?/g;
/**
* C0 controls with no display meaning here. Tab, newline, backspace and ESC
* survive: the first two for layout, backspace for the cursor replay, ESC
* for anser's CSI split.
*/
const INERT_CONTROL = /[\u0000-\u0007\u000b-\u001a\u001c-\u001f\u007f]/g;
/**
* Lines whose cursor movements have to be replayed: a carriage return, a
* backspace, or an erase-in-line. The erase pattern matches the SAME CSI shape
* `replayLine` parses (parameters may carry `;` and intermediate bytes), so a
* form like `\x1b[1;2K` cannot slip past this guard and skip its own erase.
*/
const NEEDS_REPLAY = /\r|\u0008|\u001b\[[\u0030-\u003f]*[\u0020-\u002f]*K/;
/** SGR sequences alone, for folding state through a line that needs no replay. */
const SGR_SEQUENCE = /\u001b\[([\u0030-\u003f]*)[\u0020-\u002f]*m/g;
/** Terminal tab stop width; a tab advances to the next multiple of this. */
const TAB_WIDTH = 8;
/**
* Combining marks and other zero-width code points: a terminal advances no
* column for them, so `e` + U+0301 occupies one cell and a two-column redraw
* covers both code points.
*/
const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}\u200b-\u200f\u2060]$/u;
/**
* Characters a terminal advances two columns for: CJK scripts, fullwidth forms,
* CJK punctuation, and characters with emoji presentation. Text-presentation
* symbols (`\u2713`, `\u26a0` and the rest of U+2600-U+27BF) are ONE column and
* must stay out of this set.
*/
const WIDE_CHAR = /* @__PURE__ */ new RegExp("\\p{Script=Han}|\\p{Script=Hiragana}|\\p{Script=Katakana}|\\p{Script=Hangul}|\\p{Emoji_Presentation}|[\\uff01-\\uff60\\u3000-\\u303e]", "u");
/**
* Whether a character occupies two terminal columns (CJK, fullwidth forms,
* emoji). Covers the ranges a command's output realistically carries; a
* narrower guess would misalign the columns this card exists to preserve.
* @param char - one character from the output.
* @returns true when the terminal advances two columns for it.
*/
function isWide(char) {
	const code = char.codePointAt(0);
	if (code === void 0 || code < 4352) return false;
	return WIDE_CHAR.test(char);
}
/** The default state: no color, no attributes. */
const SGR_NONE = {
	fg: "",
	bg: "",
	attrs: []
};
/** Attribute closers, mapped to the opener parameters each one turns off. */
const ATTR_CLOSERS = {
	22: ["1", "2"],
	23: ["3"],
	24: ["4"],
	25: ["5", "6"],
	27: ["7"],
	28: ["8"],
	29: ["9"]
};
/**
* Fold one SGR sequence's parameters into the state it produces.
* @param state - state in force before the sequence.
* @param params - the sequence's raw parameter string (`31`, `1;4`, `38;5;208`).
* @returns the state the sequence leaves in force.
*/
function foldSgr(state, params) {
	const codes = params === "" ? ["0"] : params.split(";");
	let next = state;
	for (let index = 0; index < codes.length; index++) {
		const code = String(codes[index]);
		if (code === "" || code === "0") {
			next = SGR_NONE;
			continue;
		}
		if (code === "38" || code === "48") {
			const kind = codes[index + 1] ?? "";
			const span = kind === "2" ? 4 : kind === "5" ? 2 : 0;
			const value = codes.slice(index, index + span + 1).join(";");
			next = code === "38" ? {
				...next,
				fg: value
			} : {
				...next,
				bg: value
			};
			index += span;
			continue;
		}
		const closes = ATTR_CLOSERS[code];
		if (closes !== void 0) {
			next = {
				...next,
				attrs: next.attrs.filter((attr) => !closes.includes(attr))
			};
			continue;
		}
		const numeric = Number(code);
		if (code === "39") {
			next = {
				...next,
				fg: ""
			};
			continue;
		}
		if (code === "49") {
			next = {
				...next,
				bg: ""
			};
			continue;
		}
		if (numeric >= 30 && numeric <= 37 || numeric >= 90 && numeric <= 97) {
			next = {
				...next,
				fg: code
			};
			continue;
		}
		if (numeric >= 40 && numeric <= 47 || numeric >= 100 && numeric <= 107) {
			next = {
				...next,
				bg: code
			};
			continue;
		}
		if (!next.attrs.includes(code)) next = {
			...next,
			attrs: [...next.attrs, code]
		};
	}
	return next;
}
/**
* Render a state as the one canonical sequence that establishes it from the
* default, so a boundary emits a bounded string no matter how the state was
* reached.
* @param state - the state to open.
* @returns the SGR sequence, or the empty string for the default state.
*/
function openSgr(state) {
	const codes = [...state.attrs];
	if (state.fg !== "") codes.push(state.fg);
	if (state.bg !== "") codes.push(state.bg);
	return codes.length === 0 ? "" : `\u001b[${codes.join(";")}m`;
}
/** Whether two states are the same, so a boundary is only emitted on a change. */
function sameSgr(a, b) {
	return a.fg === b.fg && a.bg === b.bg && a.attrs.length === b.attrs.length && a.attrs.every((attr, index) => attr === b.attrs[index]);
}
/**
* Replay one line's cursor movements the way a terminal paints it, into a
* column buffer. Carriage return and backspace only MOVE the cursor — neither
* erases anything — so what a reader sees is whatever each column last had
* written to it. That distinction is the whole point of doing this as a buffer
* rather than as string surgery: `100%\rOK` shows `OK0%` because the redraw is
* shorter than the frame beneath it, and a trailing `abc\b` still shows `abc`
* because nothing ever overwrote the `c`.
*
* A CSI sequence occupies no column; it changes the state that the NEXT writes
* are stamped with, which is how a terminal stores color per cell. `red bad`
* then three backspaces then `ok` therefore shows `okd` with the `d` still red:
* `ok` overwrote two cells and the third kept the state it was written with.
* The columns are re-emitted as runs, so anser sees that same styling.
* @param line - one output line, still carrying its CSI sequences.
* @param entrySgr - SGR state in force when the line begins, since a newline
*   does not reset it.
* @returns the line as the terminal would have it after every movement, plus the
*   SGR state at its end for the next line to enter with.
*/
function replayLine(line, entrySgr) {
	const csi = /\u001b\[([\u0030-\u003f]*)[\u0020-\u002f]*([\u0040-\u007e])/g;
	/** Per column: the state in force when it was written, and its character. */
	const columns = [];
	let cursor = 0;
	let sgr = entrySgr;
	let at = 0;
	/** Clear a cell and, for a wide pair, its partner: a terminal erases both. */
	const clear = (index, fill) => {
		const cell = columns[index];
		if (cell?.spacer === true && index > 0) columns[index - 1] = {
			sgr,
			char: fill
		};
		else if (cell !== void 0 && isWide(cell.char) && columns[index + 1]?.spacer === true) columns[index + 1] = {
			sgr,
			char: fill
		};
		columns[index] = {
			sgr,
			char: fill
		};
	};
	const consume = (chunk) => {
		for (const char of chunk) {
			if (char === "\r") {
				cursor = 0;
				continue;
			}
			if (char === "\b") {
				cursor = Math.max(0, cursor - 1);
				continue;
			}
			if (char === "	") {
				const stop = cursor + TAB_WIDTH - cursor % TAB_WIDTH;
				for (; cursor < stop; cursor++) columns[cursor] ??= {
					sgr,
					char: " "
				};
				continue;
			}
			if (ZERO_WIDTH.test(char)) {
				const base = cursor > 0 ? columns[cursor - 1] : void 0;
				if (base !== void 0) columns[cursor - 1] = {
					sgr: base.sgr,
					char: base.char + char
				};
				continue;
			}
			clear(cursor, " ");
			columns[cursor] = {
				sgr,
				char
			};
			cursor++;
			if (isWide(char)) {
				columns[cursor] = {
					sgr,
					char: "",
					spacer: true
				};
				cursor++;
			}
		}
	};
	for (const match of line.matchAll(csi)) {
		consume(line.slice(at, match.index));
		at = match.index + match[0].length;
		const params = String(match[1]);
		const final = String(match[2]);
		if (final === "K") {
			const mode = String(params.split(";")[0]);
			if (mode === "1") for (let index = 0; index <= cursor; index++) clear(index, " ");
			else columns.length = mode === "2" ? 0 : cursor;
			continue;
		}
		if (final !== "m") continue;
		sgr = foldSgr(sgr, params);
	}
	consume(line.slice(at));
	let out = "";
	let active = entrySgr;
	for (let index = 0; index < columns.length; index++) {
		const column = columns[index] ?? {
			sgr: SGR_NONE,
			char: " "
		};
		if (!sameSgr(column.sgr, active)) {
			if (!sameSgr(active, SGR_NONE)) out += "\x1B[0m";
			out += openSgr(column.sgr);
			active = column.sgr;
		}
		const leadIntact = index > 0 && isWide(columns[index - 1]?.char ?? "");
		out += column.spacer === true && !leadIntact ? " " : column.char;
	}
	if (!sameSgr(active, sgr)) {
		if (!sameSgr(active, SGR_NONE)) out += "\x1B[0m";
		out += openSgr(sgr);
	}
	return {
		text: out,
		sgr
	};
}
/**
* Replay every line's cursor movements. A `\r` that only terminates a CRLF line
* is dropped first, so those lines keep their text instead of being redrawn onto
* themselves. SGR state threads across lines: a newline does not reset it, so a
* run opened before a redraw still colors the lines after it.
* @param text - output text, already free of OSC and non-CSI escapes.
* @returns the text with each line painted as the terminal would.
*/
function applyCursorMovements(text) {
	const replayed = [];
	let sgr = SGR_NONE;
	for (const raw of text.split("\n")) {
		const line = raw.replace(/\r+$/, "");
		if (NEEDS_REPLAY.test(line)) {
			const result = replayLine(line, sgr);
			replayed.push(result.text);
			sgr = result.sgr;
			continue;
		}
		replayed.push(line);
		for (const match of line.matchAll(SGR_SEQUENCE)) sgr = foldSgr(sgr, String(match[1]));
	}
	return replayed.join("\n");
}
/**
* Remove every escape sequence and control character that carries no color,
* leaving CSI sequences for anser and `\n`/`\t` for layout. Cursor movements
* (carriage return, backspace) replay first, since their effect on the visible
* text must land before the characters that expressed them are dropped.
* @param text - raw command output.
* @returns text whose only remaining escapes are CSI sequences.
*/
function sanitize(text) {
	return applyCursorMovements(text.replace(OSC_SEQUENCE, "").replace(NON_CSI_ESCAPE, "")).replace(INERT_CONTROL, "");
}
/**
* Resolve one run's colors and decorations.
* @param chunk - the anser chunk to style.
* @returns the run's inline style, or undefined when it carries no SGR state.
*/
function resolveStyle(chunk) {
	const style = {};
	const background = chunk.bg === null ? void 0 : `rgb(${chunk.bg})`;
	if (background !== void 0) style.backgroundColor = background;
	if (chunk.fg !== null) {
		const literal = `rgb(${chunk.fg})`;
		style.color = background === void 0 ? TOKEN_BY_BASIC_RGB[chunk.fg.replace(/\s+/g, "")] ?? literal : literal;
	}
	for (const decoration of chunk.decorations) Object.assign(style, STYLE_BY_DECORATION[decoration]);
	return Object.keys(style).length === 0 ? void 0 : style;
}
/**
* Parse command output into styled spans grouped by line.
* @param text - raw output text, which may contain ANSI escape sequences.
* @returns one entry per output line (always at least one, possibly empty).
*/
function parseAnsiLines(text) {
	let current = [];
	const lines = [current];
	for (const chunk of Anser.ansiToJson(sanitize(text), {
		json: true,
		remove_empty: true
	})) {
		const style = resolveStyle(chunk);
		for (const [index, part] of chunk.content.split("\n").entries()) {
			if (index > 0) {
				current = [];
				lines.push(current);
			}
			if (part !== "") current.push({
				text: part,
				style
			});
		}
	}
	return lines;
}
//#endregion
//#region lib/types/head-tail-cap.js
/**
* Compute the head/tail cap metrics for a list of `total` rows against `maxLines`,
* given whether the surface is expanded. Pure arithmetic; the caller slices its
* own rows with `headLines`/`tailLines` so a block can layer its own concerns
* (SearchBlock restores a tail file header) on top.
* @param total - the list's row count.
* @param maxLines - the collapsed-height cap in rows.
* @param expanded - whether the surface is expanded (uncaps the list).
* @returns the split metrics.
*/
function headTailCap(total, maxLines, expanded) {
	const hidden = total - maxLines;
	const headLines = Math.ceil(maxLines / 2);
	return {
		hidden,
		capped: hidden > 0 && !expanded,
		headLines,
		tailLines: maxLines - headLines
	};
}
//#endregion
//#region lib/types/use-copy-feedback.js
/** How long the `copied` flag stays true after a successful write, in ms. */
const COPIED_FEEDBACK_MS = 1e3;
/**
* Copy `text` to the clipboard with one-second success feedback.
* @param text - the text to write on copy.
* @returns the `copied` flag and the `onCopy` handler.
*/
function useCopyFeedback(text) {
	const [copied, setCopied] = useState(false);
	return {
		copied,
		onCopy: useCallback(() => {
			if (copied) return;
			writeClipboard(text).then((ok) => {
				if (!ok) return;
				setCopied(true);
				window.setTimeout(() => {
					setCopied(false);
				}, COPIED_FEEDBACK_MS);
			});
		}, [copied, text])
	};
}
//#endregion
//#region lib/types/TerminalBlock.js
/** Output lines shown before the height cap collapses the middle. */
const DEFAULT_TERMINAL_MAX_LINES = 16;
/**
* Prompt label for a working directory: `~` for the home directory itself,
* otherwise the path's last segment (both separators accepted, trailing
* separators ignored), falling back to the path itself when it has no
* segment.
* @param cwd - the working directory path.
* @param home - absolute home directory, when the caller knows it.
* @returns the prompt label.
*/
function promptLabel(cwd, home) {
	const trimmed = cwd.replace(/[/\\]+$/, "");
	if (home !== void 0 && trimmed === home.replace(/[/\\]+$/, "")) return "~";
	const segment = trimmed.split(/[/\\]/).pop();
	return segment === void 0 || segment === "" ? cwd : segment;
}
/**
* Status pill text for a settled command, or undefined when the command
* settled cleanly (exit 0, no signal) and needs no pill — the same
* distinction the bash tool's own exit-status markers draw.
* @param exitCode - settled exit code, when known; null when the command settled without one.
* @param signal - settled terminating signal name, when known.
* @param labels - display copy for the pill text.
* @returns the pill text, or undefined for a clean exit.
*/
function statusText(exitCode, signal, labels) {
	if (signal !== void 0) return labels.signal(signal);
	if (exitCode === null) return labels.noExitCode;
	if (exitCode !== void 0 && exitCode !== 0) return labels.exitCode(exitCode);
}
/**
* Run-state indicator for the command, shown at the head of the prompt line so
* the card states whether the command is still running without the reader
* having to infer it from the presence of output. Three of {@link StateDotState}'s
* five states are reachable: the running chase (the same
* indicator a running tool row's leading icon uses, so the row and its card
* never disagree), green for a clean settle, red for a signal or a non-zero
* exit — the same status distinction {@link statusText} draws for the pill. A
* settled command whose exit status never reached the view counts as a clean
* settle: the view says it finished and says nothing went wrong.
* @param running - the command has not settled.
* @param exitCode - settled exit code, when known; null when the command settled without one.
* @param signal - settled terminating signal name, when known.
* @param labels - display copy for the text label.
* @returns the dot's state and its text label, since the dot is aria-hidden.
*/
function runState(running, exitCode, signal, labels) {
	if (running) return {
		state: "ongoing",
		label: labels.running
	};
	if (statusText(exitCode, signal, labels) !== void 0) return {
		state: "error",
		label: labels.failed
	};
	return {
		state: "done",
		label: labels.done
	};
}
/**
* Render one parsed output line. Runs without SGR state render as bare text,
* so uncolored output carries no span wrappers.
* @param line - the line's styled runs.
* @returns the line's children.
*/
function renderLine$1(line) {
	return line.map((span, index) => span.style === void 0 ? span.text : jsx("span", {
		style: span.style,
		children: span.text
	}, index));
}
/**
* Render a shell command as a terminal surface.
* @param props - see {@link TerminalBlockProps}.
* @returns the terminal block element.
*/
function TerminalBlock({ command, cwd, home, output, exitCode, signal, running = false, maxLines = 16, copyText, runStateDot = true, className, labels }) {
	const copy = labels;
	const text = output ?? "";
	const lines = useMemo(() => {
		const parsed = parseAnsiLines(text);
		const last = parsed[parsed.length - 1];
		return parsed.length > 1 && last !== void 0 && last.every((span) => span.text === "") ? parsed.slice(0, -1) : parsed;
	}, [text]);
	const [expanded, setExpanded] = useState(false);
	const { copied, onCopy } = useCopyFeedback(copyText ?? text);
	const onToggle = useCallback(() => {
		setExpanded((value) => !value);
	}, []);
	const status = statusText(exitCode, signal, copy);
	const state = runState(running, exitCode, signal, copy);
	const commandLines = useMemo(() => {
		return (command.endsWith("\n") ? command.slice(0, -1) : command).split("\n");
	}, [command]);
	const empty = lines.every((line) => line.every((span) => span.text.trim() === ""));
	const { hidden, capped, headLines, tailLines } = headTailCap(lines.length, maxLines, expanded);
	const body = !running || !empty;
	return jsxs("div", {
		className: clsx(css$27.block, className),
		"data-terminal": "",
		"data-running": running ? "" : void 0,
		"data-body": body ? "" : void 0,
		children: [jsxs("div", {
			className: css$27.header,
			children: [
				jsxs("div", {
					className: css$27.prompt,
					children: [runStateDot && jsx("span", {
						className: css$27.runStateLabel,
						children: state.label
					}), commandLines.map((line, index) => jsxs("div", {
						className: css$27.promptLine,
						children: [
							index === 0 && runStateDot && jsx(StateDot, {
								state: state.state,
								className: css$27.runState
							}),
							jsx("span", {
								className: css$27.cwd,
								children: index > 0 || cwd === void 0 ? "$" : promptLabel(cwd, home)
							}),
							jsx("span", {
								className: css$27.command,
								children: line
							})
						]
					}, index))]
				}),
				status !== void 0 && jsx(Pill, {
					className: css$27.status,
					children: status
				}),
				(copyText !== void 0 || !running && !empty) && jsx("button", {
					type: "button",
					className: css$27.copyButton,
					onClick: onCopy,
					children: copied ? copy.copied : copy.copy
				})
			]
		}), body && (empty ? jsx("div", {
			className: css$27.empty,
			children: copy.noOutput
		}) : jsxs("div", {
			className: css$27.output,
			children: [
				(capped ? lines.slice(0, headLines) : lines).map((line, index) => jsx("div", {
					className: css$27.line,
					children: renderLine$1(line)
				}, index)),
				hidden > 0 && jsx("button", {
					type: "button",
					className: css$27.expand,
					"aria-expanded": expanded,
					"aria-label": expanded ? copy.collapseAria : copy.expandAria(hidden),
					onClick: onToggle,
					children: expanded ? copy.collapse : copy.expand(hidden)
				}),
				capped && lines.slice(lines.length - tailLines).map((line, index) => jsx("div", {
					className: css$27.line,
					children: renderLine$1(line)
				}, index))
			]
		}))]
	});
}
//#endregion
//#region lib/types/FoldToggle.js
/**
* Render the shared head-tail fold control with caller-owned localized copy.
* @param props - Fold state, localized labels, and toggle callback.
* @returns The accessible expand or collapse button.
*/
function FoldToggle({ className, expanded, hidden, labels, onToggle }) {
	return jsx("button", {
		type: "button",
		className,
		"aria-expanded": expanded,
		"aria-label": expanded ? labels.collapseAria : labels.expandAria(hidden),
		onClick: onToggle,
		children: expanded ? labels.collapse : labels.expand(hidden)
	});
}
//#endregion
//#region lib/types/CodeToolbar.js
/** Shared language, wrapping, and clipboard controls for code cards. */
/**
* Render a language label and keyboard-accessible icon actions with tooltips.
* @param props - Localized labels, current state, and card-owned actions.
* @returns The shared code-card header.
*/
function CodeToolbar({ lang, title, status, labels, copyLabel, copiedLabel, copied, wrapped, onCopy, onWrap }) {
	const wrapLabel = wrapped ? labels.unwrapLabel : labels.wrapLabel;
	const clipboardLabel = copied ? copiedLabel : copyLabel;
	return jsxs("div", {
		className: cardCss.header,
		"data-code-block-banner": true,
		children: [jsxs("div", {
			className: cardCss.heading,
			children: [jsx("span", {
				className: cardCss.language,
				children: supportsHighlighting(lang) ? lang : labels.codeLabel
			}), title !== void 0 && jsx("span", {
				className: cardCss.title,
				title,
				children: title
			})]
		}), jsxs("div", {
			className: cardCss.actions,
			children: [
				status !== void 0 && jsx("span", {
					className: cardCss.status,
					children: status
				}),
				onWrap !== void 0 && jsx(Tooltip, {
					label: wrapLabel,
					side: "top",
					portal: true,
					children: jsx("button", {
						type: "button",
						className: cardCss.action,
						"aria-label": labels.wrapLabel,
						"aria-pressed": wrapped,
						onClick: onWrap,
						children: wrapped ? jsx(IconNowrapFillRegular, { size: 14 }) : jsx(IconWrapFillRegular, { size: 14 })
					})
				}),
				onCopy !== void 0 && jsx(Tooltip, {
					label: clipboardLabel,
					side: "top",
					portal: true,
					children: jsx("button", {
						type: "button",
						className: cardCss.action,
						"aria-label": clipboardLabel,
						onClick: onCopy,
						children: copied ? jsx(IconCheckOutlineRegular, { size: 14 }) : jsx(IconCopyOutlineRegular, { size: 14 })
					})
				})
			]
		})]
	});
}
//#endregion
//#region lib/types/markdown/useViewportHighlighting.js
const noop = () => {};
/** One document-wide observer; activated elements leave it permanently. */
var HighlightViewport = class {
	observer;
	activators = /* @__PURE__ */ new Map();
	observe(element, activate) {
		if (typeof IntersectionObserver === "undefined") {
			activate();
			return noop;
		}
		this.observer ??= new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const current = this.activators.get(entry.target);
				/* v8 ignore next -- the observer reports only elements still registered with it. */
				if (current === void 0) continue;
				this.activators.delete(entry.target);
				this.observer?.unobserve(entry.target);
				current();
			}
			this.releaseEmptyObserver();
		});
		this.activators.set(element, activate);
		this.observer.observe(element);
		return () => {
			this.activators.delete(element);
			this.observer?.unobserve(element);
			this.releaseEmptyObserver();
		};
	}
	releaseEmptyObserver() {
		if (this.activators.size > 0) return;
		this.observer?.disconnect();
		this.observer = void 0;
	}
};
const highlightViewport = new HighlightViewport();
/**
* Activate one supported code surface when it first intersects the viewport.
* Activation lasts for the component lifetime; browsers without
* IntersectionObserver activate immediately.
* @param target - Code surface whose plain rendering reserves its geometry.
* @param lang - Optional language hint.
* @returns Whether this component may build highlighted output.
*/
function useViewportHighlighting(target, lang) {
	const supported = supportsHighlighting(lang);
	const [activated, setActivated] = useState(false);
	const activate = useCallback(() => {
		setActivated(true);
	}, []);
	useEffect(() => {
		if (activated || !supported) return;
		const element = target.current;
		/* v8 ignore next -- React attaches the host ref before running effects. */
		if (element === null) return;
		return highlightViewport.observe(element, activate);
	}, [
		activate,
		activated,
		supported,
		target
	]);
	return activated && supported;
}
//#endregion
//#region lib/types/ReadBlock.js
/**
* Content lines shown before the height cap collapses the middle. Matches
* TerminalBlock's default so a long read and a long command output cut at the
* same place in the same flow.
*/
const DEFAULT_READ_MAX_LINES = 16;
function renderSpans(spans) {
	return spans.map((span, index) => jsx("span", {
		style: span.style,
		children: span.text
	}, index));
}
/**
* Render a read tool result as a line-numbered, optionally syntax-highlighted
* file view.
* @param props - see {@link ReadBlockProps}.
* @returns the read block element.
*/
function ReadBlock({ label, labels, lines, totalLines, lang, maxLines = 16, className }) {
	const rootRef = useRef(null);
	const highlighting = useViewportHighlighting(rootRef, lang);
	const raw = useMemo(() => lines.map((line) => line.text).join("\n"), [lines]);
	const highlighted = useMemo(() => highlighting ? highlightLines(raw, lang) : void 0, [
		highlighting,
		raw,
		lang,
		useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount)
	]);
	const [expanded, setExpanded] = useState(false);
	const [copied, setCopied] = useState(false);
	const [wrapped, setWrapped] = useState(false);
	const onCopy = useCallback(() => {
		if (copied) return;
		writeClipboard(raw).then((ok) => {
			if (!ok) return;
			setCopied(true);
			window.setTimeout(() => {
				setCopied(false);
			}, 1e3);
		});
	}, [copied, raw]);
	const onToggle = useCallback(() => {
		setExpanded((value) => !value);
	}, []);
	const hidden = lines.length - maxLines;
	const capped = hidden > 0 && !expanded;
	const headLines = Math.ceil(maxLines / 2);
	const tailLines = maxLines - headLines;
	const windowed = lines.length < totalLines;
	const rows = (slice) => slice.map(([line, spans]) => jsxs("div", {
		className: css$28.line,
		children: [jsx("span", {
			className: css$28.gutter,
			"aria-hidden": true,
			children: line.number
		}), jsx("span", {
			className: css$28.content,
			children: spans === void 0 ? line.text : renderSpans(spans)
		})]
	}, line.number));
	const gutterStyle = { "--dsl-read-gutter": `${lines.reduce((digits, line) => Math.max(digits, String(line.number).length), 3)}ch` };
	const paired = lines.map((line, index) => [line, highlighted?.[index]]);
	return jsxs("div", {
		ref: rootRef,
		className: clsx(cardCss.card, css$28.block, className),
		"data-read": "",
		"data-code-wrap": wrapped,
		style: gutterStyle,
		children: [jsx(CodeToolbar, {
			lang,
			title: label,
			status: windowed ? labels.window(lines.length, totalLines) : void 0,
			labels,
			copyLabel: labels.copy,
			copiedLabel: labels.copied,
			copied,
			wrapped,
			onCopy: lines.length > 0 ? onCopy : void 0,
			onWrap: () => {
				setWrapped((value) => !value);
			}
		}), jsxs("div", {
			className: cardCss.body,
			children: [
				rows(capped ? paired.slice(0, headLines) : paired),
				hidden > 0 && jsx(FoldToggle, {
					className: css$28.expand,
					expanded,
					hidden,
					labels,
					onToggle
				}),
				capped && rows(paired.slice(paired.length - tailLines))
			]
		})]
	});
}
//#endregion
//#region lib/types/DiffBlock.js
/** Output lines shown before the height cap collapses the middle. */
const DEFAULT_DIFF_MAX_LINES = 16;
/** Local exhaustiveness helper — this package does not depend on `dsh-llm`. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a row kind is forged */
function assertNever(value) {
	throw new Error(`unreachable diff row kind: ${String(value)}`);
}
/** The dim class per row kind (path/gap chrome vs the diff's own +/- colors). */
const ROW_CLASS = {
	path: css$29.path,
	del: css$29.del,
	add: css$29.add,
	context: css$29.context,
	gap: css$29.gap
};
/** Bound synchronous edit-graph search; one replacement consumes two edits. */
const MAX_DIFF_EDIT_LENGTH = 256;
/** Derive exact local patches or a whole-fragment replacement when search exceeds the limit. */
function localHunks(diff) {
	const oldLines = contentLines(diff.oldText ?? "");
	const newLines = contentLines(diff.newText);
	const normalize = (lines) => lines.map((line) => `${line}\n`).join("");
	return structuredPatch("", "", normalize(oldLines), normalize(newLines), void 0, void 0, {
		context: 3,
		maxEditLength: MAX_DIFF_EDIT_LENGTH
	})?.hunks ?? [{ lines: [...oldLines.map((line) => `-${line}`), ...newLines.map((line) => `+${line}`)] }];
}
/**
* Count displayed additions and deletions. Exact patches exclude shared context;
* comparisons exceeding the edit limit count both complete fragments as replaced.
* Text follows {@link contentLines}'s terminator rule.
* @param diffs - the hunks to count.
* @returns the +/- totals for tool summaries.
*/
function diffTotals(diffs) {
	let added = 0;
	let removed = 0;
	for (const diff of diffs) for (const hunk of localHunks(diff)) for (const line of hunk.lines) {
		if (line.startsWith("+")) added++;
		if (line.startsWith("-")) removed++;
	}
	return {
		added,
		removed
	};
}
/**
* Flatten local patches into rows.
* A path header opens each new file. A `⋯` gap separates consecutive same-file
* fragments and distant patches within a fragment.
* @param diffs - the hunks to render.
* @returns the body rows.
*/
function buildRows(diffs) {
	const rows = [];
	let prevPath;
	for (const diff of diffs) {
		if (diff.path !== prevPath) rows.push({
			kind: "path",
			text: diff.path
		});
		else rows.push({
			kind: "gap",
			text: "⋯"
		});
		prevPath = diff.path;
		for (const [index, hunk] of localHunks(diff).entries()) {
			if (index > 0) rows.push({
				kind: "gap",
				text: "⋯"
			});
			for (const line of hunk.lines) {
				const kind = line.startsWith("-") ? "del" : line.startsWith("+") ? "add" : "context";
				rows.push({
					kind,
					text: line.slice(1)
				});
			}
		}
	}
	return rows;
}
/**
* Split a side's text into its content lines. Empty text is zero lines (a full
* deletion's `newText` or a create's absent `oldText` side draws nothing), and a
* single trailing newline is a line terminator rather than an extra empty line —
* the same terminator rule TerminalBlock applies to command output. An interior
* blank line (a genuine `\n\n`) survives.
* @param text - the removed or added side's text.
* @returns the content lines, without the terminating newline.
*/
function contentLines(text) {
	if (text === "") return [];
	return (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
}
/**
* Copy the full local diff, including folded rows: removed/added lines have
* `- `/`+ ` prefixes, context has two spaces, and paths and gaps stay verbatim.
* @param rows - the flattened body rows.
* @returns the diff as plain text.
*/
function copyText$1(rows) {
	return rows.map((row) => {
		switch (row.kind) {
			case "del": return `- ${row.text}`;
			case "add": return `+ ${row.text}`;
			case "context": return `  ${row.text}`;
			case "path": return row.text;
			case "gap": return row.text;
			/* v8 ignore next -- closed-union backstop; only reached if a row kind is forged */
			default: return assertNever(row.kind);
		}
	}).join("\n");
}
/**
* Render a file mutation as an inline diff surface.
* @param props - see {@link DiffBlockProps}.
* @returns the diff block element.
*/
function DiffBlock({ diffs, labels, maxLines = 16, className }) {
	const rows = useMemo(() => buildRows(diffs), [diffs]);
	const [expanded, setExpanded] = useState(false);
	const [copied, setCopied] = useState(false);
	const [wrapped, setWrapped] = useState(false);
	const firstLanguage = diffs[0] === void 0 ? void 0 : languageForPath(diffs[0].path);
	const language = diffs.every((diff) => languageForPath(diff.path) === firstLanguage) ? firstLanguage : void 0;
	const onCopy = useCallback(() => {
		if (copied) return;
		writeClipboard(copyText$1(rows)).then((ok) => {
			if (!ok) return;
			setCopied(true);
			window.setTimeout(() => {
				setCopied(false);
			}, 1e3);
		});
	}, [copied, rows]);
	const onToggle = useCallback(() => {
		setExpanded((value) => !value);
	}, []);
	if (rows.length === 0) return null;
	const hidden = rows.length - maxLines;
	const capped = hidden > 0 && !expanded;
	const headLines = Math.ceil(maxLines / 2);
	const tailLines = maxLines - headLines;
	const head = capped ? rows.slice(0, headLines) : rows;
	const tail = capped ? rows.slice(rows.length - tailLines) : [];
	return jsxs("div", {
		className: clsx(cardCss.card, css$29.block, className),
		"data-diff": "",
		"data-code-wrap": wrapped,
		children: [jsx(CodeToolbar, {
			lang: language,
			labels,
			copyLabel: labels.copy,
			copiedLabel: labels.copied,
			copied,
			wrapped,
			onCopy,
			onWrap: () => {
				setWrapped((value) => !value);
			}
		}), jsxs("div", {
			className: css$29.body,
			children: [
				head.map((row, index) => jsx("div", {
					className: clsx(css$29.line, ROW_CLASS[row.kind]),
					children: row.text
				}, index)),
				hidden > 0 && jsx(FoldToggle, {
					className: css$29.expand,
					expanded,
					hidden,
					labels,
					onToggle
				}),
				tail.map((row, index) => jsx("div", {
					className: clsx(css$29.line, ROW_CLASS[row.kind]),
					children: row.text
				}, index))
			]
		})]
	});
}
//#endregion
//#region lib/types/SearchBlock.js
/**
* Result rows shown before the height cap collapses the middle. Matches
* {@link DEFAULT_TERMINAL_MAX_LINES} so a search card and a terminal card cut a
* long result at the same place.
*/
const DEFAULT_SEARCH_MAX_LINES = 16;
/**
* The plain-text form the copy control writes: the whole structured result
* regardless of the height cap or which groups are collapsed, so the clipboard
* carries the result rather than what the card happens to be showing.
* @param props - the card's props.
* @returns the copyable text, or the empty string for an empty result.
*/
function copyText(props) {
	if (props.kind === "paths") return props.paths.join("\n");
	return props.files.map((file) => [file.path, ...file.matches.map((m) => `${m.lineNumber}: ${m.line}`)].join("\n")).join("\n\n");
}
/**
* Number of retained results the card holds: the matched-line count across all
* files for a matches card, the path count for a paths card. This is the count
* the banner summary reports against `total` when the result was capped.
* @param props - the card's props.
* @returns the retained result count.
*/
function shownCount(props) {
	return props.kind === "paths" ? props.paths.length : props.files.reduce((sum, file) => sum + file.matches.length, 0);
}
/**
* The banner summary. When the search was capped it reads `显示 X / 共 N …` so
* the retained count and the pre-cap total sit in one clause (mirroring the read
* card's `显示 X / Y 行`); when it was not capped it is a plain count of what the
* card holds. The unit — `处匹配 · K 个文件` for grep, `个路径` for glob — trails
* the count either way.
* @param props - the card's props.
* @param shown - the retained result count from {@link shownCount}.
* @param truncated - whether the search was capped.
* @param total - the pre-cap total the truncation clause reports.
* @returns the summary text.
*/
function summaryText(props, shown, truncated, total) {
	return props.kind === "paths" ? props.labels.pathsSummary(shown, total, truncated) : props.labels.matchesSummary(shown, total, props.files.length, truncated);
}
/**
* Flatten a card's shape into its render rows, dropping a collapsed file
* group's match rows.
* @param props - the card's props.
* @param collapsed - the set of collapsed file-group indices (matches only).
* @returns the flattened rows in output order.
*/
function toRows(props, collapsed) {
	if (props.kind === "paths") return props.paths.map((path) => ({
		type: "path",
		path
	}));
	const rows = [];
	props.files.forEach((file, index) => {
		const isCollapsed = collapsed.has(index);
		rows.push({
			type: "file",
			path: file.path,
			count: file.matches.length,
			index,
			collapsed: isCollapsed
		});
		if (isCollapsed) return;
		for (const match of file.matches) rows.push({
			type: "match",
			lineNumber: match.lineNumber,
			line: match.line,
			key: `${index}:${match.lineNumber}`,
			fileIndex: index
		});
	});
	return rows;
}
/**
* A stable React key for a flattened render row: the group-scoped match key, a
* file-index-scoped header key, or the path itself. Rows of different types
* never collide, since each key carries its type prefix or the group index.
* @param row - the flattened row.
* @returns the key.
*/
function rowKey(row) {
	switch (row.type) {
		case "match": return `match:${row.key}`;
		case "file": return `file:${row.index}`;
		case "path": return `path:${row.path}`;
	}
}
/**
* Render a completed search as a grouped-matches or flat-path card.
* @param props - see {@link SearchBlockProps}.
* @returns the search block element.
*/
function SearchBlock(props) {
	const { truncated, total, maxLines = 16, className } = props;
	const [expanded, setExpanded] = useState(false);
	const [collapsed, setCollapsed] = useState(() => /* @__PURE__ */ new Set());
	const rows = toRows(props, collapsed);
	const shown = shownCount(props);
	const empty = rows.length === 0;
	const { copied, onCopy } = useCopyFeedback(copyText(props));
	const onToggle = useCallback(() => {
		setExpanded((value) => !value);
	}, []);
	const toggleFile = useCallback((index) => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			return next;
		});
	}, []);
	const { hidden, capped, headLines, tailLines } = headTailCap(rows.length, maxLines, expanded);
	const head = capped ? rows.slice(0, headLines) : rows;
	const naturalTail = capped ? rows.slice(rows.length - tailLines) : [];
	const tailLead = naturalTail[0];
	const tailHeader = tailLead?.type === "match" && !head.some((row) => row.type === "file" && row.index === tailLead.fileIndex) ? rows.find((row) => row.type === "file" && row.index === tailLead.fileIndex) : void 0;
	const tail = tailHeader === void 0 ? naturalTail : naturalTail.slice(1);
	const renderRow = (row) => {
		if (row.type === "path") return jsx("div", {
			className: css$30.line,
			children: row.path
		});
		if (row.type === "match") return jsxs("div", {
			className: css$30.line,
			children: [jsxs("span", {
				className: css$30.lineNumber,
				children: [row.lineNumber, ": "]
			}), row.line]
		});
		return jsxs("button", {
			type: "button",
			className: css$30.fileHeader,
			"aria-expanded": !row.collapsed,
			onClick: () => {
				toggleFile(row.index);
			},
			children: [jsx("span", {
				className: css$30.filePath,
				children: row.path
			}), jsx("span", {
				className: css$30.fileCount,
				children: row.count
			})]
		});
	};
	return jsxs("div", {
		className: clsx(css$30.block, className),
		"data-search": props.kind,
		children: [jsxs("div", {
			className: css$30.header,
			children: [jsx("span", {
				className: css$30.summary,
				children: summaryText(props, shown, truncated, total)
			}), !empty && jsx("button", {
				type: "button",
				className: css$30.copyButton,
				onClick: onCopy,
				children: copied ? props.labels.copied : props.labels.copy
			})]
		}), empty ? jsx("div", {
			className: css$30.empty,
			children: props.labels.noResults
		}) : jsxs("div", {
			className: css$30.body,
			children: [
				head.map((row) => jsx("div", { children: renderRow(row) }, rowKey(row))),
				hidden > 0 && jsx("button", {
					type: "button",
					className: css$30.expand,
					"aria-expanded": expanded,
					"aria-label": expanded ? props.labels.collapseAria : props.labels.expandAria(hidden),
					onClick: onToggle,
					children: expanded ? props.labels.collapse : props.labels.expand(hidden)
				}),
				tailHeader !== void 0 && jsx("div", { children: renderRow(tailHeader) }, `tailHeader:${rowKey(tailHeader)}`),
				tail.map((row) => jsx("div", { children: renderRow(row) }, rowKey(row)))
			]
		})]
	});
}
//#endregion
//#region lib/types/markdown/incremental.js
/**
* Incremental block-level markdown parsing for an append-only text stream.
*
* Re-parsing the whole accumulated document on every streaming chunk is
* quadratic in the final reply length. CommonMark block parsing is line-based
* and appended text can only reshape the parse frontier — the last top-level
* block (a paragraph becoming a setext heading or a table, or a list
* continuing after a blank line) — so earlier blocks are final. This parser
* therefore freezes all but the trailing {@link UNSTABLE_TAIL_BLOCKS} blocks
* and re-parses only the source tail behind them. A final unclosed top-level
* fence cannot freeze as a block, so its completed content lines use a second
* frontier: only the last completed line and current partial line return
* through the caller's grammar. Each source region is therefore parsed a
* bounded number of times over the stream instead of once per chunk.
*
* The block freeze boundary comes from the parser's own `position` offsets.
* The cut sits at the *end offset* of the last frozen block (not the next
* block's start): a following block's start offset excludes up to three spaces
* of insignificant leading indentation, which is harmless to drop, but
* cutting at the previous end also keeps the inter-block blank lines in the
* tail so the sliced source stays verbatim. Fence scanning only recognizes a
* parser-confirmed code node and closing delimiter; ambiguous input returns to
* the normal tail parse.
*
* Known deviation, shared with any prefix-freeze scheme: micromark resolves
* reference-style links and footnotes document-wide at parse time, so a
* reference whose definition lands on the other side of the freeze boundary
* renders literally until the settled full parse self-heals it.
*/
/**
* Trailing blocks kept unstable. Appended text reshapes at most the last
* block; the second-to-last is retained as safety margin so a freeze decision
* never has to reason about the parse frontier.
*/
const UNSTABLE_TAIL_BLOCKS = 2;
/**
* A block's render key: its absolute source start offset. A position-less
* node (a grammar is free to omit positions) falls back to a negative
* list-index key — unique within one update's tail, which is the only place
* the fallback can occur: freezing requires the cut block's position, so a
* position-less parse keeps every block in the tail (real grammars always
* stamp positions and never take this path).
*/
function blockKey(node, base, index) {
	const offset = node.position?.start.offset;
	return offset === void 0 ? -(index + 1) : base + offset;
}
/** Return the first line terminator at or after `start`, including a CRLF pair. */
function lineTerminatorEnd(text, start) {
	for (let index = start; index < text.length; index += 1) {
		const char = text[index];
		if (char === "\n") return index + 1;
		if (char === "\r") return text[index + 1] === "\n" ? index + 2 : index + 1;
	}
}
/**
* Source prefix before the last completed line. Keeping that line beside the
* current partial line lets the grammar retain its trailing-newline semantics.
*/
function committableLinePrefixLength(text) {
	let previousEnd = 0;
	let end = 0;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (char === "\n") {
			previousEnd = end;
			end = index + 1;
			continue;
		}
		if (char !== "\r" || index + 1 >= text.length) continue;
		if (text[index + 1] === "\n") index += 1;
		previousEnd = end;
		end = index + 1;
	}
	return previousEnd;
}
/** Exact source terminator ending a non-empty committable prefix. */
function trailingLineTerminator(text) {
	return text.endsWith("\r\n") ? "\r\n" : text.endsWith("\r") ? "\r" : "\n";
}
/** Whether `text` contains a CommonMark closing fence on one of its logical lines. */
function containsClosingFence(text, marker, markerLength) {
	let start = 0;
	while (start <= text.length) {
		let end = start;
		while (end < text.length && text[end] !== "\n" && text[end] !== "\r") end += 1;
		const line = text.slice(start, end);
		let indent = 0;
		while (indent < 3 && line[indent] === " ") indent += 1;
		let run = indent;
		while (line[run] === marker) run += 1;
		if (run - indent >= markerLength && /^[ \t]*$/.test(line.slice(run))) return true;
		if (end === text.length) return false;
		start = text[end] === "\r" && text[end + 1] === "\n" ? end + 2 : end + 1;
	}
	/* v8 ignore next -- each loop iteration returns at EOF or advances past a line terminator. */
	return false;
}
/** Advance an mdast point across one append while treating a split CRLF as one line ending. */
function advancePoint(point, appended, precededByCarriageReturn) {
	let line = point.line;
	let column = point.column;
	let afterCarriageReturn = precededByCarriageReturn;
	for (const char of appended) {
		if (char === "\n") {
			if (!afterCarriageReturn) line += 1;
			column = 1;
			afterCarriageReturn = false;
			continue;
		}
		if (char === "\r") {
			line += 1;
			column = 1;
			afterCarriageReturn = true;
			continue;
		}
		column += 1;
		afterCarriageReturn = false;
	}
	return {
		line,
		column,
		offset: point.offset + appended.length
	};
}
/**
* Append-only incremental parser over a caller-supplied grammar. One instance
* accumulates one streaming document; non-append input resets it.
*/
var IncrementalMarkdownParser = class {
	parse;
	prevText = "";
	tailStart = 0;
	frozen = [];
	generation = 0;
	cached = null;
	openFence = null;
	/** @param parse - Grammar shared with whatever renders the blocks, so boundaries agree. */
	constructor(parse) {
		this.parse = parse;
	}
	/** Parse one unclosed-fence content slice through the caller's grammar. */
	fenceValue(state, text) {
		const root = this.parse(`${state.syntheticPrefix}${text}`);
		if (root.children.length !== 1) return void 0;
		const node = root.children[0];
		return node.type === "code" ? node.value : void 0;
	}
	/** Recognize the parsed tail's final unclosed fence and prepare its incremental content frontier. */
	openFenceState(text, base, tail, frozen) {
		const codeIndex = tail.length - 1;
		const block = tail[codeIndex];
		if (block?.node.type !== "code") return null;
		const node = block.node;
		const startOffset = node.position?.start.offset;
		const end = node.position?.end;
		if (startOffset === void 0 || end?.offset === void 0) return null;
		/* v8 ignore next -- the caller's parse slice ends at text.length, so its final node ends there. */
		if (base + end.offset !== text.length) return null;
		const source = text.slice(base);
		const previousLf = source.lastIndexOf("\n", startOffset - 1);
		const previousCr = source.lastIndexOf("\r", startOffset - 1);
		const lineStart = Math.max(previousLf, previousCr) + 1;
		const terminatorEnd = lineTerminatorEnd(source, startOffset);
		/* v8 ignore next -- a parser-confirmed fenced code node requires its opening line terminator. */
		if (terminatorEnd === void 0) return null;
		if (terminatorEnd === source.length && source.endsWith("\r")) return null;
		const openingLine = source.slice(lineStart, terminatorEnd).replace(/[\r\n]+$/, "");
		const opening = /^( {0,3})(`{3,}|~{3,})/.exec(openingLine);
		if (opening === null) return null;
		const indent = opening[1];
		const run = opening[2];
		/* v8 ignore next -- mdast positions a fenced code node at the matched delimiter after indentation. */
		if (lineStart + indent.length !== startOffset) return null;
		const marker = run[0];
		const contentStart = base + terminatorEnd;
		const content = text.slice(contentStart);
		if (containsClosingFence(content, marker, run.length)) return null;
		const syntheticPrefix = `${indent}${run}\n`;
		const stableLength = committableLinePrefixLength(content);
		const stableValue = stableLength === 0 ? "" : this.fenceValue({ syntheticPrefix }, content.slice(0, stableLength));
		if (stableValue === void 0) return null;
		const pendingStart = contentStart + stableLength;
		const stableSource = content.slice(0, stableLength);
		const valuePrefix = stableLength === 0 ? "" : `${stableValue}${trailingLineTerminator(stableSource)}`;
		const pendingValue = this.fenceValue({ syntheticPrefix }, text.slice(pendingStart));
		if (pendingValue === void 0 || `${valuePrefix}${pendingValue}` !== node.value) return null;
		return {
			marker,
			markerLength: run.length,
			syntheticPrefix,
			codeIndex,
			frozen,
			tail,
			pendingStart,
			valuePrefix,
			end: {
				line: end.line,
				column: end.column,
				offset: end.offset
			},
			endedWithCarriageReturn: text.endsWith("\r")
		};
	}
	/** Extend a recognized unclosed fence without parsing its completed content prefix again. */
	updateOpenFence(state, text, previousText) {
		const pending = text.slice(state.pendingStart);
		if (containsClosingFence(pending, state.marker, state.markerLength)) return void 0;
		const pendingValue = this.fenceValue(state, pending);
		if (pendingValue === void 0) return void 0;
		const stableLength = committableLinePrefixLength(pending);
		const stableValue = stableLength === 0 ? "" : this.fenceValue(state, pending.slice(0, stableLength));
		if (stableValue === void 0) return void 0;
		const previousNode = state.tail[state.codeIndex].node;
		const end = advancePoint(state.end, text.slice(previousText.length), state.endedWithCarriageReturn);
		const node = {
			...previousNode,
			value: `${state.valuePrefix}${pendingValue}`,
			position: {
				start: previousNode.position.start,
				end
			}
		};
		const tail = state.tail.map((entry, index) => index === state.codeIndex ? {
			...entry,
			node
		} : entry);
		const cached = {
			frozen: state.frozen,
			tail,
			generation: this.generation
		};
		this.openFence = {
			...state,
			tail,
			pendingStart: state.pendingStart + stableLength,
			valuePrefix: stableLength === 0 ? state.valuePrefix : `${state.valuePrefix}${stableValue}${trailingLineTerminator(pending.slice(0, stableLength))}`,
			end,
			endedWithCarriageReturn: text.endsWith("\r")
		};
		return cached;
	}
	/**
	* Fold the current accumulated text and return the frozen/tail split.
	* Idempotent for identical input (the previous result is returned as-is),
	* so callers may invoke it from render paths that re-execute.
	* @param text - The full accumulated markdown source.
	* @returns Frozen and tail blocks with stream-stable render keys.
	*/
	update(text) {
		if (this.cached !== null && text === this.prevText) return this.cached;
		if (!text.startsWith(this.prevText)) {
			this.prevText = "";
			this.tailStart = 0;
			this.frozen = [];
			this.openFence = null;
			this.generation += 1;
		}
		const previousText = this.prevText;
		if (previousText !== "" && this.openFence !== null) {
			const incremental = this.updateOpenFence(this.openFence, text, previousText);
			if (incremental !== void 0) {
				this.prevText = text;
				this.cached = incremental;
				return incremental;
			}
			this.openFence = null;
		}
		this.prevText = text;
		const base = this.tailStart;
		const blocks = this.parse(text.slice(base)).children;
		let firstUnstable = Math.max(0, blocks.length - UNSTABLE_TAIL_BLOCKS);
		if (firstUnstable > 0) {
			const cutEnd = blocks[firstUnstable - 1]?.position?.end.offset;
			if (cutEnd === void 0) firstUnstable = 0;
			else {
				for (const node of blocks.slice(0, firstUnstable)) this.frozen.push({
					node,
					key: blockKey(node, base, this.frozen.length)
				});
				this.tailStart = base + cutEnd;
			}
		}
		const tail = blocks.slice(firstUnstable).map((node, index) => ({
			node,
			key: blockKey(node, base, index)
		}));
		this.cached = {
			frozen: [...this.frozen],
			tail,
			generation: this.generation
		};
		this.openFence = this.openFenceState(text, base, tail, this.cached.frozen);
		return this.cached;
	}
};
//#endregion
//#region lib/types/markdown/local-image-syntax.js
/**
* Recover only unambiguous, unescaped image-only paragraphs containing a local path with spaces.
* @param root - Parsed Markdown tree, modified in place.
* @param source - Original source used to distinguish authored syntax from escaped examples.
* @returns The same root with recovered image nodes.
*/
function recoverLocalImages(root, source) {
	const visit = (node) => {
		if (node.type === "paragraph" && node.children.length === 1) {
			const [child] = node.children;
			if (child.type === "text" && child.position !== void 0 && source.slice(child.position.start.offset, child.position.end.offset) === child.value) {
				const match = /^!\[([^\]\n]*)\]\(((?:\/(?!\/)|\.{1,2}\/|[a-z]:[\\/])[^\n<>()[\]"']+\.[a-z\d]+)\)$/iu.exec(child.value);
				if (match !== null && match[2].includes(" ") && classifyFileType(match[2]) === "image") node.children = [{
					type: "image",
					alt: match[1],
					url: match[2],
					position: child.position
				}];
			}
		} else if ("children" in node) for (const child of node.children) visit(child);
	};
	visit(root);
	return root;
}
//#endregion
//#region lib/types/markdown/cjkFriendlyStrong.js
/** Let asterisk strong emphasis close after punctuation when CJK prose continues without whitespace. */
const cjkCharacter = new RegExp([
	"\\p{Script_Extensions=Han}",
	"\\p{Script_Extensions=Hiragana}",
	"\\p{Script_Extensions=Katakana}",
	"\\p{Script_Extensions=Hangul}",
	"\\p{Script_Extensions=Bopomofo}"
].join("|"), "u");
function isCjkCharacter(code) {
	return code !== null && code >= 0 && cjkCharacter.test(String.fromCodePoint(code));
}
const tokenizeCjkFriendlyAttention = function(effects, ok, nok) {
	const configuredAttentionMarkers = this.parser.constructs.attentionMarkers.null;
	if (configuredAttentionMarkers === void 0) throw new Error("micromark CommonMark attention markers are unavailable");
	const attentionMarkers = configuredAttentionMarkers;
	const previous = this.previous;
	const before = classifyCharacter(previous);
	let marker = codes.eof;
	return start;
	function start(code) {
		/* v8 ignore next -- this text construct is dispatched only for an asterisk. */
		if (code !== codes.asterisk) return nok(code);
		marker = code;
		effects.enter("attentionSequence");
		return inside(code);
	}
	function inside(code) {
		if (code === marker) {
			effects.consume(code);
			return inside;
		}
		const token = effects.exit("attentionSequence");
		const after = classifyCharacter(code);
		const open = !after || after === constants.characterGroupPunctuation && Boolean(before) || attentionMarkers.includes(code);
		const commonMarkClose = !before || before === constants.characterGroupPunctuation && Boolean(after) || attentionMarkers.includes(previous);
		const cjkStrongClose = token.end.offset - token.start.offset >= 2 && unicodePunctuation(previous) && isCjkCharacter(code);
		const close = commonMarkClose || cjkStrongClose;
		token._open = open;
		token._close = close;
		return ok(code);
	}
};
const cjkFriendlyAttention = {
	name: "cjkFriendlyAttention",
	resolveAll: attention.resolveAll,
	tokenize: tokenizeCjkFriendlyAttention
};
const cjkFriendlyStrongExtension = { text: { [codes.asterisk]: cjkFriendlyAttention } };
/**
* Extend CommonMark asterisk strong emphasis for punctuation-delimited CJK
* prose, as a micromark syntax extension for `fromMarkdown`.
* @returns The micromark syntax extension.
*/
function cjkFriendlyStrong() {
	return cjkFriendlyStrongExtension;
}
//#endregion
//#region lib/types/markdown/mathCompatibility.js
/** Extend upstream dollar-only math syntax with TeX delimiters while reusing its token vocabulary. */
const previousBackslash = function(code) {
	if (code !== codes.backslash) return true;
	const tail = this.events.at(-1);
	/* v8 ignore next -- a previous code necessarily has a preceding event. */
	if (tail === void 0) return false;
	return tail[1].type === types.characterEscape;
};
const tokenizeBackslashMathText = function(effects, ok, nok) {
	return start;
	function start(code) {
		/* v8 ignore next -- the text construct is dispatched only for a backslash. */
		if (code !== codes.backslash) return nok(code);
		effects.enter("mathText");
		effects.enter("mathTextSequence");
		effects.consume(code);
		return open;
	}
	function open(code) {
		if (code !== codes.leftParenthesis) return nok(code);
		effects.consume(code);
		effects.exit("mathTextSequence");
		return between;
	}
	function between(code) {
		if (code === codes.eof) return nok(code);
		if (code === codes.backslash) return effects.attempt({
			partial: true,
			tokenize: tokenizeClose
		}, close, afterCloseAttempt)(code);
		if (markdownLineEnding(code)) {
			effects.enter(types.lineEnding);
			effects.consume(code);
			effects.exit(types.lineEnding);
			return between;
		}
		return dataStart(code);
	}
	function afterCloseAttempt(code) {
		return effects.check({
			partial: true,
			tokenize: tokenizeOpen
		}, nok, dataStart)(code);
	}
	function dataStart(code) {
		effects.enter("mathTextData");
		effects.consume(code);
		return code === codes.backslash ? afterDataBackslash : data;
	}
	function afterDataBackslash(code) {
		if (code === codes.backslash) {
			effects.consume(code);
			return data;
		}
		return data(code);
	}
	function data(code) {
		if (code === codes.eof || code === codes.backslash || markdownLineEnding(code)) {
			effects.exit("mathTextData");
			return between(code);
		}
		effects.consume(code);
		return data;
	}
	function close(code) {
		effects.exit("mathText");
		return ok(code);
	}
	function tokenizeClose(closeEffects, closeOk, closeNok) {
		return slash;
		function slash(code) {
			/* v8 ignore next -- this partial construct is attempted only at a backslash. */
			if (code !== codes.backslash) return closeNok(code);
			closeEffects.enter("mathTextSequence");
			closeEffects.consume(code);
			return parenthesis;
		}
		function parenthesis(code) {
			if (code !== codes.rightParenthesis) return closeNok(code);
			closeEffects.consume(code);
			closeEffects.exit("mathTextSequence");
			return closeOk;
		}
	}
	function tokenizeOpen(openEffects, openOk, openNok) {
		return slash;
		function slash(code) {
			/* v8 ignore next -- the opening check follows a failed close attempt at a backslash. */
			if (code !== codes.backslash) return openNok(code);
			openEffects.enter(types.chunkString);
			openEffects.consume(code);
			return parenthesis;
		}
		function parenthesis(code) {
			if (code !== codes.leftParenthesis) return openNok(code);
			openEffects.consume(code);
			openEffects.exit(types.chunkString);
			return openOk;
		}
	}
};
function createMathFlow(marker, openMarker, closeMarker, multiline) {
	const tokenize = function(effects, ok, nok) {
		const self = this;
		let oddBackslashRun = false;
		const tail = self.events.at(-1);
		const initialSize = tail?.[1].type === types.linePrefix ? tail[2].sliceSerialize(tail[1], true).length : 0;
		return start;
		function start(code) {
			/* v8 ignore next -- the flow construct is dispatched only for its marker. */
			if (code !== marker) return nok(code);
			effects.enter("mathFlow");
			effects.enter("mathFlowFence");
			effects.enter("mathFlowFenceSequence");
			effects.consume(code);
			return open;
		}
		function open(code) {
			if (code !== openMarker) return nok(code);
			effects.consume(code);
			effects.exit("mathFlowFenceSequence");
			effects.exit("mathFlowFence");
			return marker === codes.dollarSign ? afterDollarOpen : content;
		}
		function afterDollarOpen(code) {
			return code === codes.dollarSign ? nok(code) : content(code);
		}
		function content(code) {
			if (code === codes.eof) return nok(code);
			if (code === marker && (marker !== codes.dollarSign || !oddBackslashRun)) return effects.attempt({
				partial: true,
				tokenize: tokenizeClosingFence
			}, closed, afterClosingFenceAttempt)(code);
			if (markdownLineEnding(code)) return multiline ? effects.attempt(nonLazyContinuation, afterContinuation, nok)(code) : nok(code);
			return valueStart(code);
		}
		function afterClosingFenceAttempt(code) {
			return marker === codes.backslash ? effects.check({
				partial: true,
				tokenize: tokenizeOpeningFence
			}, nok, markerValueStart)(code) : markerValueStart(code);
		}
		function afterContinuation(code) {
			return effects.attempt({
				partial: true,
				tokenize: tokenizeClosingFence
			}, closed, initialSize ? factorySpace(effects, content, types.linePrefix, initialSize + 1) : content)(code);
		}
		function valueStart(code) {
			effects.enter("mathFlowValue");
			oddBackslashRun = code === codes.backslash;
			effects.consume(code);
			return value;
		}
		function markerValueStart(code) {
			effects.enter("mathFlowValue");
			oddBackslashRun = false;
			effects.consume(code);
			return valueAfterMarker;
		}
		function valueAfterMarker(code) {
			if (code === marker) {
				effects.consume(code);
				return value;
			}
			return value(code);
		}
		function value(code) {
			if (code === codes.eof || code === marker || markdownLineEnding(code)) {
				effects.exit("mathFlowValue");
				return content(code);
			}
			oddBackslashRun = code === codes.backslash ? !oddBackslashRun : false;
			effects.consume(code);
			return value;
		}
		function closed(code) {
			effects.exit("mathFlow");
			return ok(code);
		}
		function tokenizeClosingFence(closeEffects, closeOk, closeNok) {
			return factorySpace(closeEffects, sequenceStart, types.linePrefix, constants.tabSize);
			function sequenceStart(code) {
				if (code !== marker) return closeNok(code);
				closeEffects.enter("mathFlowFence");
				closeEffects.enter("mathFlowFenceSequence");
				closeEffects.consume(code);
				return sequenceEnd;
			}
			function sequenceEnd(code) {
				if (code !== closeMarker) return closeNok(code);
				closeEffects.consume(code);
				closeEffects.exit("mathFlowFenceSequence");
				return factorySpace(closeEffects, after, types.whitespace);
			}
			function after(code) {
				if (code !== codes.eof && !markdownLineEnding(code)) return closeNok(code);
				closeEffects.exit("mathFlowFence");
				return closeOk(code);
			}
		}
		function tokenizeOpeningFence(openEffects, openOk, openNok) {
			return sequenceStart;
			function sequenceStart(code) {
				/* v8 ignore next -- the opening check follows a failed close attempt at the marker. */
				if (code !== marker) return openNok(code);
				openEffects.enter(types.chunkString);
				openEffects.consume(code);
				return sequenceEnd;
			}
			function sequenceEnd(code) {
				if (code !== openMarker) return openNok(code);
				openEffects.consume(code);
				openEffects.exit(types.chunkString);
				return openOk;
			}
		}
	};
	return {
		concrete: true,
		name: marker === codes.dollarSign ? "sameLineDollarMathFlow" : "backslashMathFlow",
		tokenize
	};
}
const tokenizeNonLazyContinuation = function(effects, ok, nok) {
	const self = this;
	return start;
	function start(code) {
		/* v8 ignore next -- continuation constructs are attempted only after a line ending. */
		if (code === codes.eof) return ok(code);
		/* v8 ignore next -- continuation constructs are attempted only after a line ending. */
		if (!markdownLineEnding(code)) return nok(code);
		effects.enter(types.lineEnding);
		effects.consume(code);
		effects.exit(types.lineEnding);
		return lineStart;
	}
	function lineStart(code) {
		return self.parser.lazy[self.now().line] ? nok(code) : ok(code);
	}
};
const nonLazyContinuation = {
	partial: true,
	tokenize: tokenizeNonLazyContinuation
};
const backslashMathText = {
	name: "backslashMathText",
	previous: previousBackslash,
	tokenize: tokenizeBackslashMathText
};
const backslashMathFlow = createMathFlow(codes.backslash, codes.leftSquareBracket, codes.rightSquareBracket, true);
const sameLineDollarMathFlow = createMathFlow(codes.dollarSign, codes.dollarSign, codes.dollarSign, false);
const backslashMath = {
	flow: {
		[codes.backslash]: backslashMathFlow,
		[codes.dollarSign]: sameLineDollarMathFlow
	},
	text: { [codes.backslash]: backslashMathText }
};
/**
* TeX backslash delimiters and same-line display-dollar blocks as a micromark
* syntax extension reusing `micromark-extension-math`'s token vocabulary; the
* caller must also register `math()` on the same parse so the emitted tokens
* compile to standard math nodes.
* @returns The micromark syntax extension.
*/
function mathCompatibility() {
	return backslashMath;
}
//#endregion
//#region lib/types/markdown/parse.js
/**
* The markdown renderer's two mdast grammars, one per rendering arm. Each
* arm is internally consistent — the incremental tail parses, the one-shot
* parses, and the plain-text projection of a given grammar always agree on
* where blocks start and end — and the settled grammar is the streaming one
* plus the math extensions, so the arms differ only where TeX delimiters
* begin a math construct (a `$$` block is a paragraph while streaming and a
* math block once settled, by design).
*/
/**
* Parse GFM markdown (the streaming arm's grammar: no math, so incomplete
* TeX never flashes KaTeX errors mid-stream).
* @param text - Markdown source.
* @returns The mdast root.
*/
function parseGfm(text) {
	return recoverLocalImages(fromMarkdown(text, {
		extensions: [gfm(), cjkFriendlyStrong()],
		mdastExtensions: [gfmFromMarkdown()]
	}), text);
}
/**
* Parse GFM markdown plus TeX math with the compatibility delimiters
* (the settled arm's grammar).
* @param text - Markdown source.
* @returns The mdast root.
*/
function parseGfmWithMath(text) {
	return recoverLocalImages(fromMarkdown(text, {
		extensions: [
			gfm(),
			cjkFriendlyStrong(),
			mathCompatibility(),
			math()
		],
		mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()]
	}), text);
}
//#endregion
//#region lib/types/markdown/CodeBlock.js
/**
* The `pre` attributes shiki's HTML arm emits for the css-variables theme,
* mirrored so the streaming arm's tree is interchangeable with the settled
* swap (`tests/streaming-code-block.client.spec.tsx` pins the two arms'
* parity).
*/
const SHIKI_PRE_PROPS = {
	className: "shiki css-variables",
	style: {
		backgroundColor: "var(--shiki-background)",
		color: "var(--shiki-foreground)"
	},
	tabIndex: 0
};
/** Completed-line group size; React reconciles groups while the DOM remains line-for-line identical. */
const STREAMING_LINE_GROUP_SIZE = 32;
function renderLine(line, index) {
	return jsxs(Fragment$1, { children: [index > 0 && "\n", jsx("span", {
		className: "line",
		children: line.map((span, spanIndex) => jsx("span", {
			style: span.style,
			children: span.text
		}, spanIndex))
	})] }, index);
}
function CodeBlock({ code, lang, streaming, className, contentRef, lineNumbers = false, showHeader = true, copyLabel, copiedLabel, toolbarLabels, wrap }) {
	const trimmed = code.endsWith("\n") ? code.slice(0, -1) : code;
	const sourceLines = lineNumbers ? trimmed.split("\n") : void 0;
	const rootRef = useRef(null);
	const highlighting = useViewportHighlighting(rootRef, lang);
	const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount);
	const sessionRef = useRef(null);
	const lineCacheRef = useRef(null);
	const settledRef = useRef(false);
	const streamedBody = useMemo(() => {
		if (!highlighting) {
			sessionRef.current = null;
			lineCacheRef.current = null;
			settledRef.current = false;
			return;
		}
		if (streaming !== true) {
			const previous = lineCacheRef.current;
			if (previous !== null && previous.code === trimmed && previous.lang === lang) {
				settledRef.current = true;
				return previous.body;
			}
			sessionRef.current = null;
			lineCacheRef.current = null;
			settledRef.current = true;
			return;
		}
		if (settledRef.current) {
			sessionRef.current = null;
			lineCacheRef.current = null;
			settledRef.current = false;
		}
		sessionRef.current ??= new StreamingHighlightSession();
		const frame = sessionRef.current.updateFrame(trimmed, lang);
		if (frame === void 0) {
			lineCacheRef.current = null;
			return;
		}
		const previous = lineCacheRef.current;
		if (previous?.frame === frame && previous.code === trimmed && previous.lang === lang) return previous.body;
		const sameGeneration = previous?.generation === frame.generation;
		const groups = sameGeneration ? [...previous.groups] : [];
		let pending = sameGeneration ? [...previous.pending] : [];
		let nextLine = sameGeneration ? previous.nextLine : 0;
		for (const line of frame.appended) {
			pending.push(renderLine(line, nextLine));
			nextLine += 1;
			if (pending.length !== STREAMING_LINE_GROUP_SIZE) continue;
			const start = nextLine - pending.length;
			groups.push(jsx(Fragment$1, { children: pending }, start));
			pending = [];
		}
		const tail = frame.tail.map((line, index) => renderLine(line, nextLine + index));
		const tailGroup = jsx(Fragment$1, { children: [...pending, ...tail] }, nextLine - pending.length);
		const body = jsx("pre", {
			...SHIKI_PRE_PROPS,
			children: jsxs("code", { children: [groups, tailGroup] })
		});
		lineCacheRef.current = {
			code: trimmed,
			lang,
			generation: frame.generation,
			frame,
			groups,
			pending,
			nextLine,
			body
		};
		return body;
	}, [
		streaming,
		highlighting,
		trimmed,
		lang,
		loaded
	]);
	const html = useMemo(() => highlighting && streaming !== true && streamedBody === void 0 ? highlightToHtml(trimmed, lang) : void 0, [
		streaming,
		highlighting,
		streamedBody,
		trimmed,
		lang,
		loaded
	]);
	const [copied, setCopied] = useState(false);
	const [localWrapped, setWrapped] = useState(true);
	const wrapped = wrap ?? localWrapped;
	const onCopy = useCallback(() => {
		if (copied) return;
		writeClipboard(rootRef.current?.querySelector("pre")?.textContent ?? trimmed).then((ok) => {
			if (!ok) return;
			setCopied(true);
			window.setTimeout(() => {
				setCopied(false);
			}, 1e3);
		});
	}, [copied, trimmed]);
	const body = streamedBody !== void 0 ? streamedBody : html === void 0 ? jsx("pre", {
		className: css$31.plain,
		children: jsx("code", { children: sourceLines === void 0 ? trimmed : sourceLines.map((line, index) => jsxs(Fragment$1, { children: [index > 0 && "\n", jsx("span", {
			className: "line",
			children: line
		})] }, index)) })
	}) : jsx("div", { dangerouslySetInnerHTML: { __html: html } });
	return jsxs("div", {
		ref: rootRef,
		className: clsx(css$31.block, "md-code-block", lineNumbers && css$31.numbered, toolbarLabels !== void 0 && css$31.card, className),
		"data-line-numbers": lineNumbers || void 0,
		"data-code-wrap": toolbarLabels === void 0 ? void 0 : wrapped,
		style: sourceLines === void 0 ? void 0 : { "--dsl-code-block-line-number-width": `${Math.max(2, String(sourceLines.length).length)}ch` },
		children: [showHeader && jsx("div", {
			className: css$31.bannerWrap,
			children: toolbarLabels !== void 0 ? jsx(CodeToolbar, {
				lang,
				labels: toolbarLabels,
				copyLabel,
				copiedLabel,
				copied,
				wrapped,
				onCopy,
				onWrap: wrap === void 0 ? () => {
					setWrapped((value) => !value);
				} : void 0
			}) : jsxs("div", {
				className: css$31.banner,
				"data-code-block-banner": true,
				children: [jsx("div", {
					className: css$31.infostring,
					children: lang ?? ""
				}), jsx("div", {
					className: css$31.action,
					children: jsx("button", {
						type: "button",
						className: css$31.copyButton,
						onClick: onCopy,
						children: copied ? copiedLabel : copyLabel
					})
				})]
			})
		}), jsx("div", {
			ref: contentRef,
			className: css$31.content,
			"data-code-block-content": true,
			children: body
		})]
	});
}
//#endregion
//#region lib/types/markdown/file-link.js
/** Local Markdown destinations accepted by the file-preview callback. */
/**
* Decode a file destination and its optional GitHub-style line fragment.
* Literal `?` and `#` in filenames must be percent-encoded.
* @param value - Parsed Markdown link destination.
* @returns A local path and optional first line, or undefined for URLs,
* fragment-only links, queries, malformed escapes, or invalid line ranges.
*/
function parseFileLink(value) {
	const hash = value.indexOf("#");
	const destination = hash < 0 ? value : value.slice(0, hash);
	if (destination.includes("?")) return void 0;
	let path;
	try {
		path = decodeURIComponent(destination);
	} catch (_error) {
		return;
	}
	if (path.length === 0 || /[\u0000-\u001f\u007f]/.test(path) || /^[\\/]{2}/.test(path) || /^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return void 0;
	if (hash < 0) return { path };
	const fragment = value.slice(hash + 1);
	const match = /^L([1-9]\d*)(?:-L([1-9]\d*))?$/.exec(fragment);
	if (match === null) return void 0;
	const line = Number(match[1]);
	const end = match[2] === void 0 ? line : Number(match[2]);
	if (!Number.isSafeInteger(line) || !Number.isSafeInteger(end) || end < line) return void 0;
	return {
		path,
		line
	};
}
//#endregion
//#region lib/types/markdown/katex.js
/**
* TeX-to-React via KaTeX, replicating the rehype-katex pipeline this renderer
* replaced: the same three-arm error chain (strict render, `strict: 'ignore'`
* retry, error span) and a DOM-identical element tree, so settled math keeps
* its exact markup. KaTeX emits an HTML string; the browser's own HTML parser
* (`DOMParser`, applying the spec's SVG/MathML foreign-content attribute
* adjustments KaTeX output relies on) turns it into a tree this module maps
* onto React elements — KaTeX output is a static span/MathML/SVG vocabulary
* with no raw user HTML, the same trust shiki's tree gets in CodeBlock.
*
* React 18 has no MathML support, so the `.katex-mathml` subtree's elements
* land in the HTML namespace — exactly as they did under the replaced
* hast-util-to-jsx-runtime pipeline. The visual arm is the `.katex-html`
* span tree; the MathML arm serves assistive technology, which reads it by
* tag name regardless of namespace.
*/
/**
* Convert one inline `style` attribute string into React's style object.
* KaTeX emits only plain kebab-case declarations (no custom properties and no
* nameless declarations), so camel-casing the property is the whole mapping.
*/
function styleObject(css) {
	const style = {};
	for (const declaration of css.split(";")) {
		const colon = declaration.indexOf(":");
		if (colon === -1) continue;
		const key = declaration.slice(0, colon).trim().replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
		style[key] = declaration.slice(colon + 1).trim();
	}
	return style;
}
/** Map one parsed DOM node onto a React element (text nodes pass through). */
function domToReact(node, key) {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent;
	/* v8 ignore next 2 -- KaTeX output holds only elements and text; other
	node kinds cannot appear in its serialized vocabulary. */
	if (node.nodeType !== Node.ELEMENT_NODE) return null;
	const element = node;
	const props = { key };
	for (const attribute of element.attributes) if (attribute.name === "class") props["className"] = attribute.value;
	else if (attribute.name === "style") props["style"] = styleObject(attribute.value);
	else props[attribute.name] = attribute.value;
	const children = [...element.childNodes].map(domToReact);
	return children.length === 0 ? createElement(element.localName, props) : createElement(element.localName, props, ...children);
}
/**
* Render TeX source to React elements through KaTeX.
* @param value - The TeX source (math node value; fenced `math` blocks append
* their trailing newline to match the replaced pipeline's text extraction).
* @param displayMode - Display (block) versus inline rendering.
* @returns KaTeX's element tree, or the error span when the source does not
* parse (colored with KaTeX's stock `errorColor`, matching rehype-katex).
*/
function renderTexToReact(value, displayMode) {
	let html;
	try {
		html = katex.renderToString(value, {
			displayMode,
			throwOnError: true
		});
	} catch (error) {
		try {
			html = katex.renderToString(value, {
				displayMode,
				strict: "ignore",
				throwOnError: false
			});
		} catch {
			/* v8 ignore next 8 */
			return jsx("span", {
				className: "katex-error",
				style: { color: "#cc0000" },
				title: String(error),
				children: value
			});
		}
	}
	return [...new DOMParser().parseFromString(html, "text/html").body.childNodes].map(domToReact);
}
//#endregion
//#region lib/types/markdown/MarkdownDelegate.js
/** Consumer-owned navigation for Markdown links. */
const MarkdownDelegateContext = createContext({});
/**
* Scope Markdown navigation without threading callbacks through renderers.
* Nested providers replace the enclosing capabilities. Handler changes reach cached links.
* @param props - Child tree and its file and HTTP(S) link handlers.
* @returns the scoped child tree.
*/
function MarkdownDelegateProvider({ children, openExternalLink, openFile, fileImages }) {
	const delegate = useMemo(() => ({
		openExternalLink,
		openFile,
		fileImages
	}), [
		openExternalLink,
		openFile,
		fileImages
	]);
	return jsx(MarkdownDelegateContext.Provider, {
		value: delegate,
		children
	});
}
/**
* Read the nearest Markdown navigation capabilities.
* @returns Owner callbacks, or an empty delegate outside a provider.
*/
function useMarkdownDelegate() {
	return useContext(MarkdownDelegateContext);
}
//#endregion
//#region lib/types/ImageLightbox.js
/**
* Document-level original-image preview opened by clicking a thumbnail.
* Closes on Escape, backdrop press, or the close control, and restores focus
* to the opener on unmount. Rendered through a body portal: an opener inside
* a transformed or filtered ancestor would otherwise trap the fixed backdrop
* in that ancestor's box instead of covering the viewport.
*
* @param props.src - the original image URL.
* @param props.alt - the image's alt text.
* @param props.labels - dialog and close-control strings.
* @param props.onClose - dismiss callback owned by the opener.
* @returns the modal preview dialog.
*/
function ImageLightbox({ src, alt, labels, onClose }) {
	const closeRef = useRef(null);
	const restoreRef = useRef(null);
	useEffect(() => {
		restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		closeRef.current?.focus();
		const onKeyDown = (event) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				onClose();
			}
			if (event.key === "Tab") {
				event.preventDefault();
				closeRef.current?.focus();
			}
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
			restoreRef.current?.focus();
		};
	}, [onClose]);
	return createPortal(jsxs("div", {
		className: css$32.backdrop,
		role: "dialog",
		"aria-modal": "true",
		"aria-label": labels.dialog,
		children: [
			jsx("div", {
				className: css$32.mask,
				"aria-hidden": "true",
				onMouseDown: onClose
			}),
			jsx("img", {
				className: css$32.image,
				src,
				alt
			}),
			jsx("button", {
				ref: closeRef,
				type: "button",
				className: css$32.close,
				"aria-label": labels.close,
				onClick: onClose,
				children: jsx(IconCloseOutlineRegular, { size: 16 })
			})
		]
	}), document.body);
}
//#endregion
//#region lib/types/ImagePreview.js
/** Passive, contained image preview for Markdown image links. */
/**
* Render an image without introducing a second activation target.
* @param props - Source, accessible description, localized status.
* @returns A contained preview with loading or failure status.
*/
function ImagePreview({ src, alt, loadingLabel, failedLabel }) {
	return jsx(Preview, {
		src,
		alt,
		loadingLabel,
		failedLabel
	}, src);
}
function Preview({ src, alt, loadingLabel, failedLabel }) {
	const [state, setState] = useState("loading");
	return jsxs("span", {
		className: css$33.frame,
		children: [state !== "failed" && jsx("img", {
			src,
			alt,
			loading: "lazy",
			decoding: "async",
			referrerPolicy: "no-referrer",
			className: css$33.image,
			"data-ready": state === "ready" || void 0,
			onLoad: () => {
				setState("ready");
			},
			onError: () => {
				setState("failed");
			}
		}), state !== "ready" && jsxs("span", {
			className: css$33.status,
			role: "status",
			children: [state === "loading" && jsx(IconLoadingOutlineRegular, { size: 16 }), jsx("span", { children: state === "loading" ? loadingLabel : failedLabel })]
		})]
	});
}
//#endregion
//#region lib/types/markdown/render.js
/**
* Direct mdast→React markdown renderer. Replaces the react-markdown /
* remark-rehype pipeline with one switch over parsed nodes so streaming can
* cache frozen blocks as React elements; the rendered DOM is pinned
* byte-for-byte by `tests/fixtures/markdown-dom` and must not drift.
*
* External link and image destinations pass a protocol allowlist; settled
* local file links use an explicit owner callback. Images additionally require
* absolute HTTP(S), raw HTML renders as literal text (no HTML enters the
* DOM), and KaTeX runs without trusted commands. Fragment-anchor URLs fail
* the allowlist, so footnote references and back-references render as plain
* text rather than in-page links.
*
* Merge-extensible node unions fall through the documented default (render
* nothing) rather than ending in assertNever: grammars registered elsewhere
* may add node types this renderer has no mapping for.
*/
function sanitizeUrl(url) {
	try {
		switch (new URL(url).protocol) {
			case "http:":
			case "https:":
			case "mailto:": return url;
			default: return "";
		}
	} catch {
		return "";
	}
}
function remoteImageUrl(url) {
	try {
		const protocol = new URL(url).protocol;
		return protocol === "http:" || protocol === "https:" ? url : void 0;
	} catch {
		return;
	}
}
/** Rewritten images may use Web media protocols or the Desktop application's file route. */
function vocabularyImageUrl(url) {
	try {
		const protocol = new URL(url).protocol;
		return protocol === "http:" || protocol === "https:" || protocol === "blob:" || protocol === "data:" || url.startsWith("dsh-app://app/api/file?") ? url : void 0;
	} catch {
		return;
	}
}
/**
* The displayable source for one image destination: absolute HTTP(S) as
* authored, otherwise the context's local-path vocabulary when it vouches for
* the destination. Either miss leaves the authored fallback (alt text) to the
* caller.
* @param url - The authored markdown destination.
* @param pathImages - Rewriting vocabulary, when the render pass has one.
* @returns The displayable image URL, or undefined.
*/
function imageSource(url, pathImages) {
	const remote = remoteImageUrl(sanitizeUrl(normalizeUri(url)));
	if (remote !== void 0) return remote;
	const rewritten = pathImages?.resolve(url);
	return rewritten === void 0 ? void 0 : vocabularyImageUrl(rewritten);
}
/**
* Create an empty {@link ReferenceTargets}.
* @returns Fresh empty maps.
*/
function createReferenceTargets() {
	return {
		definitions: /* @__PURE__ */ new Map(),
		footnotes: /* @__PURE__ */ new Map()
	};
}
/**
* Record every definition and footnote definition under `nodes` into
* `targets`, depth-first, keeping the first definition per identifier.
* @param nodes - Subtrees to walk (top-level blocks or any nested children).
* @param targets - Accumulator, typically shared across incremental segments.
*/
function collectReferenceTargets(nodes, targets) {
	for (const node of nodes) {
		if (node.type === "definition") {
			const id = node.identifier.toUpperCase();
			if (!targets.definitions.has(id)) targets.definitions.set(id, node);
		} else if (node.type === "footnoteDefinition") {
			const id = node.identifier.toUpperCase();
			if (!targets.footnotes.has(id)) targets.footnotes.set(id, node);
		}
		if ("children" in node) collectReferenceTargets(node.children, targets);
	}
}
/**
* Render top-level blocks. Nodes that render nothing (definitions, unmapped
* types) are dropped rather than kept as null placeholders, matching the
* replaced pipeline's child lists so separator newlines land identically.
* @param blocks - Blocks with their stream-stable render keys.
* @param context - The pass state; footnote numbering mutates in document order.
* @returns One React node per rendered block.
*/
function renderBlocks(blocks, context) {
	return blocks.map((block) => renderNode(block.node, block.key, context)).filter((element) => element !== null);
}
/**
* Interleave the newline text nodes the replaced pipeline emitted between
* block-level children. They are invisible between elements but coalesce
* into adjacent literal raw-HTML text, where the DOM parity fixtures pin
* them.
* @param elements - Rendered block children with empty renders already dropped.
* @param edges - Also emit the leading and trailing newline (hast's loose wrap).
* @returns The interleaved children.
*/
function wrapBlockChildren(elements, edges) {
	const wrapped = [];
	for (const element of elements) {
		if (edges || wrapped.length > 0) wrapped.push("\n");
		wrapped.push(element);
	}
	if (edges && elements.length > 0) wrapped.push("\n");
	return wrapped;
}
/** Render container children into {@link BlockEntry} values, dropping empty renders. */
function renderBlockEntries(blocks, context) {
	const entries = [];
	for (const [index, block] of blocks.entries()) if (block.type === "paragraph") entries.push({ paragraph: renderChildren(block.children, context) });
	else {
		const element = renderNode(block, index, context);
		if (element !== null) entries.push({ element });
	}
	return entries;
}
function renderChildren(nodes, context) {
	return nodes.map((node, index) => renderNode(node, index, context));
}
function renderNode(node, key, context) {
	switch (node.type) {
		case "text": return node.value;
		case "paragraph": return jsx("p", { children: renderChildren(node.children, context) }, key);
		case "heading": return createElement(`h${node.depth}`, { key }, ...renderChildren(node.children, context));
		case "blockquote": return jsx("blockquote", { children: wrapBlockChildren(renderChildren(node.children, {
			...context,
			inBlockquote: true
		}).filter((child) => child !== null), true) }, key);
		case "thematicBreak": return jsx("hr", {}, key);
		case "break": return jsxs(Fragment$1, { children: [jsx("br", {}), "\n"] }, key);
		case "strong": return jsx("strong", { children: renderChildren(node.children, context) }, key);
		case "emphasis": return jsx("em", { children: renderChildren(node.children, context) }, key);
		case "delete": return jsx("del", { children: renderChildren(node.children, context) }, key);
		case "inlineCode": {
			const value = node.value.replace(/\r?\n|\r/g, " ");
			const href = inlineCodeHttpUrl(value);
			if (href !== void 0) return jsx("code", { children: renderSafeLink(href, [value], "link") }, key);
			const mention = context.inLink === true ? void 0 : context.fileMentions?.resolve(value);
			if (mention !== void 0) return jsx("code", { children: jsxs("button", {
				type: "button",
				className: markdownCss.fileMention,
				title: mention.title,
				"aria-label": mention.label,
				onClick: mention.open,
				children: [jsx(LinkIconMedium, {
					kind: classifyLinkPath(value),
					className: markdownCss.linkIcon
				}), value]
			}) }, key);
			return jsx("code", { children: value }, key);
		}
		case "html": return node.value;
		case "code": return renderCode(node, key, context);
		case "math": return jsx(Fragment$1, { children: renderTexToReact(node.value, true) }, key);
		case "inlineMath": return jsx(Fragment$1, { children: renderTexToReact(node.value, false) }, key);
		case "list": return renderList(node, key, context);
		case "listItem": return renderListItem(node, listItemLoose(node), key, context);
		case "table": return renderTable(node, key, context);
		case "link": return renderAnchor(node.url, renderChildren(node.children, {
			...context,
			inLink: true
		}), key, !anchorWrapsOnlyImages(node.children), context.streaming);
		case "linkReference": return renderLinkReference(node, key, context);
		case "image": return renderImage(node.url, node.alt ?? "", key, context);
		case "imageReference": return renderImageReference(node, key, context);
		case "footnoteReference": return renderFootnoteReference(node, key, context);
		case "definition":
		case "footnoteDefinition": return null;
		default: return null;
	}
}
function renderCode(node, key, context) {
	const language = node.lang ?? void 0;
	if (node.value === "") return jsx("pre", { children: jsx("code", { className: language === void 0 ? void 0 : `language-${language}` }) }, key);
	const lang = language === void 0 ? void 0 : /^[\w-]+/.exec(language)?.[0];
	if (!context.streaming && lang === "math") return jsx(Fragment$1, { children: renderTexToReact(`${node.value}\n`, true) }, key);
	return jsx(CodeBlock, {
		code: `${node.value}\n`,
		lang,
		streaming: context.streaming,
		copyLabel: context.labels.code.copyLabel,
		copiedLabel: context.labels.code.copiedLabel,
		toolbarLabels: context.labels.code.toolbarLabels
	}, key);
}
/** A list is loose when it or any of its items is spread; every item then keeps its paragraphs. */
function listLoose(list) {
	return (list.spread ?? false) || list.children.some(listItemLoose);
}
function listItemLoose(item) {
	return item.spread ?? item.children.length > 1;
}
function renderList(node, key, context) {
	const loose = listLoose(node);
	const properties = {};
	if (typeof node.start === "number" && node.start !== 1) properties.start = node.start;
	if (node.children.some((item) => typeof item.checked === "boolean")) properties.className = "contains-task-list";
	return createElement(node.ordered === true ? "ol" : "ul", {
		key,
		...properties
	}, ...node.children.map((item, index) => renderListItem(item, loose, index, context)));
}
function renderListItem(item, loose, key, context) {
	const entries = renderBlockEntries(item.children, context);
	const task = typeof item.checked === "boolean";
	if (task) {
		const checkbox = jsx("input", {
			type: "checkbox",
			checked: item.checked === true,
			disabled: true
		}, "task-checkbox");
		const head = entries[0];
		if (head !== void 0 && "paragraph" in head) head.paragraph = head.paragraph.length > 0 ? [
			checkbox,
			" ",
			...head.paragraph
		] : [checkbox];
		else entries.unshift({ paragraph: [checkbox] });
	}
	const parts = [];
	for (const [index, entry] of entries.entries()) {
		const isParagraph = "paragraph" in entry;
		if (loose || index !== 0 || !isParagraph) parts.push("\n");
		if (!isParagraph) parts.push(entry.element);
		else if (loose) parts.push(jsx("p", { children: entry.paragraph }, `p-${index}`));
		else parts.push(jsx(Fragment$1, { children: entry.paragraph }, `p-${index}`));
	}
	const tail = entries[entries.length - 1];
	if (tail !== void 0 && (loose || !("paragraph" in tail))) parts.push("\n");
	return jsx("li", {
		className: task ? "task-list-item" : void 0,
		children: parts
	}, key);
}
function renderTable(node, key, context) {
	const align = node.align ?? null;
	const [headRow, ...bodyRows] = node.children;
	const wide = (align === null ? headRow?.children.length ?? 0 : align.length) >= 4 && context.inBlockquote !== true;
	return jsx("div", {
		className: clsx(markdownCss.tableScroll, wide ? "md-table-wide" : markdownCss.tableFill),
		tabIndex: wide ? 0 : void 0,
		children: jsxs("table", { children: [headRow !== void 0 && jsx("thead", { children: renderTableRow(headRow, "th", align, 0, context) }), bodyRows.length > 0 && jsx("tbody", { children: bodyRows.map((row, index) => renderTableRow(row, "td", align, index + 1, context)) })] })
	}, key);
}
function renderTableRow(row, cellTag, align, key, context) {
	const length = align === null ? row.children.length : align.length;
	const cells = [];
	for (let index = 0; index < length; index++) {
		const cell = row.children[index];
		const alignValue = align?.[index];
		cells.push(createElement(cellTag, {
			key: index,
			style: alignValue == null ? void 0 : { textAlign: alignValue }
		}, ...cell === void 0 ? [] : renderChildren(cell.children, context)));
	}
	return jsx("tr", { children: cells }, key);
}
/**
* True when an anchor's markdown children are all images, so the anchor is a
* clickable picture (badge, thumbnail): the leading URL glyph would dangle
* beside the image instead of leading link text, so those anchors skip it.
*/
function anchorWrapsOnlyImages(children) {
	return children.length > 0 && children.every((child) => child.type === "image" || child.type === "imageReference");
}
/** Anchor over an already-authored href: allowlisted or unwrapped, with optional owner navigation for HTTP(S). */
function renderSafeLink(href, children, key, glyph = true) {
	const safeHref = sanitizeUrl(href);
	if (safeHref === "") return jsx(Fragment$1, { children }, key);
	return jsx(MarkdownAnchor, {
		href: safeHref,
		glyph,
		children
	}, key);
}
function MarkdownAnchor({ href, glyph, children }) {
	const { openExternalLink } = useMarkdownDelegate();
	const external = ["http:", "https:"].includes(new URL(href).protocol);
	const open = external ? openExternalLink : void 0;
	return jsxs("a", {
		href,
		...external ? {
			target: "_blank",
			rel: "noopener noreferrer"
		} : {},
		onClick: open === void 0 ? void 0 : (event) => {
			if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			event.preventDefault();
			open(href);
		},
		children: [glyph && jsx(LinkIconMedium, {
			kind: "url",
			href,
			className: markdownCss.linkIcon
		}), children]
	});
}
/** Local destinations use the scoped file delegate after settlement. */
function renderAnchor(url, children, key, glyph = true, streaming = false) {
	const file = streaming ? void 0 : parseFileLink(url);
	if (file !== void 0) return jsx(MarkdownFileLink, {
		file,
		glyph,
		children
	}, key);
	return renderSafeLink(normalizeUri(url), children, key, glyph);
}
function MarkdownFileLink({ file, glyph, children }) {
	const { openFile, fileImages } = useMarkdownDelegate();
	if (openFile === void 0) return jsx(Fragment, { children });
	const preview = glyph && classifyLinkPath(file.path) === "image" ? fileImages : void 0;
	const src = preview?.resolve(file.path);
	const anchor = jsxs("button", {
		type: "button",
		className: clsx(markdownCss.fileMention, markdownCss.fileLink),
		title: src === void 0 ? file.path : void 0,
		onClick: () => {
			openFile(file.path, file.line === void 0 ? void 0 : { line: file.line });
		},
		children: [glyph && jsx(LinkIconMedium, {
			kind: classifyLinkPath(file.path),
			className: markdownCss.linkIcon
		}), children]
	});
	if (src === void 0 || preview === void 0) return anchor;
	return jsx(HoverCard, {
		inline: true,
		anchor,
		content: jsxs(Fragment, { children: [jsx(ImagePreview, {
			src,
			alt: file.path,
			loadingLabel: preview.labels.loading,
			failedLabel: preview.labels.failed
		}), jsx("span", {
			className: markdownCss.previewName,
			children: file.path.split(/[\\/]/u).pop()
		})] })
	});
}
/**
* The complete inline-code value when it is exactly an absolute HTTP(S) URL
* (no surrounding whitespace); anything else stays inert code.
*/
function inlineCodeHttpUrl(value) {
	if (value.trim() !== value) return void 0;
	try {
		const protocol = new URL(value).protocol;
		return protocol === "http:" || protocol === "https:" ? value : void 0;
	} catch {
		return;
	}
}
function renderImage(url, alt, key, context) {
	return jsx(MarkdownImage, {
		destination: url,
		alt,
		pathImages: context.pathImages,
		streaming: context.streaming,
		inLink: context.inLink === true
	}, `${key}:${url}`);
}
function MarkdownImage({ destination, alt, pathImages, streaming, inLink }) {
	const { fileImages } = useMarkdownDelegate();
	const file = streaming ? void 0 : parseFileLink(destination);
	const src = (file === void 0 ? void 0 : fileImages?.resolve(file.path)) ?? imageSource(destination, pathImages);
	if (src === void 0) return jsx("span", {
		className: markdownCss.imageAlt,
		children: alt
	});
	return jsx(LoadedMarkdownImage, {
		src,
		alt,
		destination,
		preview: inLink ? void 0 : fileImages
	}, src);
}
function LoadedMarkdownImage({ src, alt, destination, preview }) {
	const [failed, setFailed] = useState(false);
	const [open, setOpen] = useState(false);
	const close = useCallback(() => {
		setOpen(false);
	}, []);
	if (failed) return jsxs("span", {
		className: markdownCss.imageAlt,
		children: [preview === void 0 ? "" : `${preview.labels.failed} · `, alt || destination]
	});
	const img = jsx("img", {
		className: markdownCss.image,
		src,
		alt,
		onError: () => {
			setFailed(true);
		},
		loading: "lazy",
		decoding: "async",
		referrerPolicy: "no-referrer"
	});
	if (preview === void 0) return img;
	return jsxs(Fragment, { children: [jsx("button", {
		type: "button",
		className: markdownCss.imageButton,
		title: preview.labels.open,
		"aria-label": alt ? `${preview.labels.open}: ${alt}` : preview.labels.open,
		onClick: () => {
			setOpen(true);
		},
		children: img
	}), open && jsx(ImageLightbox, {
		src,
		alt,
		labels: preview.labels,
		onClose: close
	})] });
}
/** The bracketed source text a reference reverts to when its definition is missing. */
function referenceSuffix(node) {
	if (node.referenceType === "collapsed") return "][]";
	if (node.referenceType === "full") return `][${node.label ?? node.identifier}]`;
	return "]";
}
function renderLinkReference(node, key, context) {
	const definition = context.targets.definitions.get(node.identifier.toUpperCase());
	if (definition === void 0) return jsxs(Fragment$1, { children: [
		"[",
		renderChildren(node.children, context),
		referenceSuffix(node)
	] }, key);
	const rendered = renderChildren(node.children, {
		...context,
		inLink: true
	});
	return renderAnchor(definition.url, rendered, key, !anchorWrapsOnlyImages(node.children), context.streaming);
}
function renderImageReference(node, key, context) {
	const definition = context.targets.definitions.get(node.identifier.toUpperCase());
	if (definition === void 0) return `![${node.alt ?? ""}${referenceSuffix(node)}`;
	return renderImage(definition.url, node.alt ?? "", key, context);
}
function renderFootnoteReference(node, key, context) {
	const id = node.identifier.toUpperCase();
	const seen = context.footnoteCounts.get(id);
	if (seen === void 0) context.footnoteOrder.push(id);
	context.footnoteCounts.set(id, (seen ?? 0) + 1);
	return jsx("sup", { children: String(context.footnoteOrder.indexOf(id) + 1) }, key);
}
/**
* Render the trailing footnote section for every footnote referenced during
* the pass, in first-reference order, with one plain-text back-reference
* marker per rendered reference.
* @param context - The pass state after all blocks rendered.
* @returns The section, or null when no referenced footnote has a definition.
*/
function renderFootnoteSection(context) {
	const items = [];
	for (const id of context.footnoteOrder) {
		const definition = context.targets.footnotes.get(id);
		if (definition === void 0) continue;
		const count = context.footnoteCounts.get(id) ?? 0;
		const backrefs = [];
		for (let reference = 1; reference <= count; reference++) {
			if (backrefs.length > 0) backrefs.push(" ");
			backrefs.push("↩");
			if (reference > 1) backrefs.push(jsx("sup", { children: String(reference) }, `re-${reference}`));
		}
		const entries = renderBlockEntries(definition.children, context);
		const tail = entries[entries.length - 1];
		const body = entries.map((entry, index) => "paragraph" in entry ? jsxs("p", { children: [entry.paragraph, entry === tail && jsxs(Fragment, { children: [" ", backrefs] })] }, `p-${index}`) : entry.element);
		if (tail === void 0 || !("paragraph" in tail)) body.push(...backrefs);
		items.push(jsx("li", {
			id: `user-content-fn-${normalizeUri(id.toLowerCase())}`,
			children: wrapBlockChildren(body, true)
		}, id));
	}
	if (items.length === 0) return null;
	return jsxs("section", {
		"data-footnotes": true,
		className: "footnotes",
		children: [jsx("h2", {
			id: "footnote-label",
			className: "sr-only",
			children: context.labels.footnotes
		}), jsx("ol", { children: items })]
	}, "footnotes");
}
//#endregion
//#region lib/types/markdown/MarkdownText.js
/**
* Untrusted assistant-Markdown renderer over the direct mdast pipeline:
* `parse.ts` grammars, the incremental streaming parser, and `render.tsx`.
* While a message streams, all but the trailing two blocks freeze as cached
* React elements and only the source tail behind them re-parses per chunk,
* so per-chunk work tracks the tail size instead of the whole reply. Frozen
* blocks keep their source-offset keys when they cross the freeze boundary,
* so React reconciles instead of remounting. Known deviation while
* streaming: a reference-style link or footnote whose definition sits on the
* other side of the freeze boundary renders literally until the settled
* full parse self-heals it.
*/
/** One settled full render: parse with math, resolve references, append the footnote section. */
function renderSettled(text, labels, fileMentions, pathImages) {
	const root = parseGfmWithMath(text);
	const targets = createReferenceTargets();
	collectReferenceTargets(root.children, targets);
	const context = {
		streaming: false,
		labels,
		fileMentions,
		pathImages,
		targets,
		footnoteOrder: [],
		footnoteCounts: /* @__PURE__ */ new Map()
	};
	const blocks = wrapBlockChildren(renderBlocks(root.children.map((node, index) => ({
		node,
		/* v8 ignore next -- parseFull uses parseGfm, which stamps every top-level node. */
		key: node.position?.start.offset ?? -(index + 1)
	})), context), false);
	const section = renderFootnoteSection(context);
	return section === null ? blocks : [
		...blocks,
		"\n",
		section
	];
}
/**
* Streaming render state for one growing message: the incremental parser,
* the frozen blocks' cached elements, and the reference/footnote state their
* rendering consumed (footnote numbering assigned to frozen references is
* final, so the tail continues from a copy of it each frame).
*/
var StreamingRenderer = class {
	labels;
	parser = new IncrementalMarkdownParser(parseGfm);
	generation = -1;
	frozenCount = 0;
	frozenElements = [];
	frozenTargets = createReferenceTargets();
	frozenFootnoteOrder = [];
	frozenFootnoteCounts = /* @__PURE__ */ new Map();
	lastText = null;
	lastRendered = [];
	/** @param labels - Localized Markdown chrome baked into cached elements; the owner replaces the renderer when it changes. */
	constructor(labels) {
		this.labels = labels;
	}
	/**
	* Render the current accumulated text. Idempotent per text value, so React
	* may re-execute the calling render freely.
	* @param text - The full accumulated markdown source.
	* @returns Frozen elements, re-rendered tail, and the footnote section.
	*/
	render(text) {
		if (text === this.lastText) return this.lastRendered;
		const { frozen, tail, generation } = this.parser.update(text);
		if (generation !== this.generation) {
			this.generation = generation;
			this.frozenCount = 0;
			this.frozenElements = [];
			this.frozenTargets = createReferenceTargets();
			this.frozenFootnoteOrder = [];
			this.frozenFootnoteCounts = /* @__PURE__ */ new Map();
		}
		const newlyFrozen = frozen.slice(this.frozenCount);
		collectReferenceTargets(newlyFrozen.map((block) => block.node), this.frozenTargets);
		const frameTargets = {
			definitions: new Map(this.frozenTargets.definitions),
			footnotes: new Map(this.frozenTargets.footnotes)
		};
		collectReferenceTargets(tail.map((block) => block.node), frameTargets);
		if (newlyFrozen.length > 0) {
			const frozenContext = {
				streaming: true,
				labels: this.labels,
				fileMentions: void 0,
				pathImages: void 0,
				targets: frameTargets,
				footnoteOrder: this.frozenFootnoteOrder,
				footnoteCounts: this.frozenFootnoteCounts
			};
			const batch = [...this.frozenElements];
			for (const element of renderBlocks(newlyFrozen, frozenContext)) {
				if (batch.length > 0) batch.push("\n");
				batch.push(element);
			}
			this.frozenElements = batch;
			this.frozenCount = frozen.length;
		}
		const tailContext = {
			streaming: true,
			labels: this.labels,
			fileMentions: void 0,
			pathImages: void 0,
			targets: frameTargets,
			footnoteOrder: [...this.frozenFootnoteOrder],
			footnoteCounts: new Map(this.frozenFootnoteCounts)
		};
		const children = [...this.frozenElements];
		for (const element of renderBlocks(tail, tailContext)) {
			if (children.length > 0) children.push("\n");
			children.push(element);
		}
		const section = renderFootnoteSection(tailContext);
		if (section !== null) children.push("\n", section);
		this.lastText = text;
		this.lastRendered = children;
		return this.lastRendered;
	}
};
/**
* Render untrusted assistant-authored Markdown as semantic React elements.
* @param props - Markdown source text preserved by the session projection;
* `streaming` parses incrementally across chunks and highlights fences as
* they grow (each fence re-tokenizes only appended text; TeX stays literal
* until the finalize swap so incomplete formulae never flash errors);
* `labels` forwards localized fence and footnote chrome — pass a
* reference-stable object (memoized per locale revision), because a new
* identity discards the streaming render cache mid-message. `fileMentions`
* links inline-code tokens its resolver recognizes as real files, and
* `pathImages` rewrites image destinations that are local file paths into
* displayable URLs its resolver vouches for. Those two vocabularies are the
* single streaming gate — they apply to settled renders only, because a
* streaming message's vocabulary is not final and frozen cached elements
* must not bake in handlers that could go stale. A surrounding
* `MarkdownDelegateProvider` can delegate ordinary HTTP(S) activation while
* modified clicks retain native behavior. `variant="compact"` uses secondary
* text sizing, uniform bold headings, and tight block spacing; the default
* `body` variant uses the full document typography.
* The provider's `openFile` enables local Markdown links in settled messages,
* including `#L24` and `#L24-L30` destinations (ranges open at their first line).
* @returns A GFM document with TeX math rendered through KaTeX; raw HTML and
* unsafe protocols are disabled. Local links without an opener remain text;
* absolute HTTP(S) images render directly.
*/
const MarkdownText = memo(function MarkdownText({ text, streaming = false, labels, fileMentions, pathImages, variant = "body" }) {
	const streamRef = useRef(null);
	const streamLabelsRef = useRef(labels);
	const children = useMemo(() => {
		if (!streaming) {
			streamRef.current = null;
			return renderSettled(text, labels, fileMentions, pathImages);
		}
		if (streamRef.current === null || streamLabelsRef.current !== labels) {
			streamRef.current = new StreamingRenderer(labels);
			streamLabelsRef.current = labels;
		}
		return streamRef.current.render(text);
	}, [
		text,
		streaming,
		labels,
		fileMentions,
		pathImages
	]);
	return jsx("div", {
		className: clsx(markdownCss.markdown, variant === "compact" && markdownCss.compact),
		"data-markdown-variant": variant === "compact" ? variant : void 0,
		children
	});
});
//#endregion
//#region lib/types/WebBlock.js
/**
* The URL to link to, or undefined when the URL must render as plain text. Only
* http(s) becomes a navigable external anchor, so a `javascript:`/`data:`/`file:`
* URL or an unparseable string never reaches the DOM as an href. This is the
* http(s) subset of the allowlist MarkdownText applies to untrusted links —
* MarkdownText also permits `mailto:`, deliberately excluded here since a
* retrieval URL is never a mail address.
* @param url - the source or fetch URL, from tool result content.
* @returns the href to use, or undefined for plain text.
*/
function safeHref(url) {
	try {
		const { protocol } = new URL(url);
		return protocol === "http:" || protocol === "https:" ? url : void 0;
	} catch {
		return;
	}
}
/**
* The link's visible label: the title when the provider gave one, otherwise the
* URL's hostname, falling back to the raw URL when it does not parse OR parses
* to an empty hostname (a `file:`/`data:`/`javascript:` URL), so a label is
* never blank.
* @param url - the source URL.
* @param title - the provider title, if any.
* @returns the label text.
*/
function linkLabel(url, title) {
	if (title !== void 0 && title !== "") return title;
	try {
		const { hostname } = new URL(url);
		return hostname === "" ? url : hostname;
	} catch {
		return url;
	}
}
/**
* A single URL rendered as a safe external anchor, or as plain text when the
* URL is not an http(s) link.
* @param props.url - the URL to render.
* @param props.label - the visible label.
* @param props.className - class for the anchor or the plain span.
* @returns the anchor or span element.
*/
function SafeLink({ url, label, className }) {
	const href = safeHref(url);
	if (href === void 0) return jsx("span", {
		className,
		children: label
	});
	return jsxs("a", {
		className,
		href,
		target: "_blank",
		rel: "noopener noreferrer",
		children: [jsx(LinkIconMedium, {
			kind: "url",
			href,
			className: css$34.linkIcon
		}), label]
	});
}
/**
* One source row in a search card: the safe link plus its snippet and date. The
* `<li value>` pins the source's 1-based citation index explicitly rather than
* relying on the `<ol>`'s implicit numbering, so a row reads by its real index
* even inside the scroll container.
* @param props.source - the source to render.
* @param props.ordinal - the source's 1-based position in the full list.
* @returns the source list item.
*/
function SourceItem({ source, ordinal }) {
	return jsxs("li", {
		className: css$34.source,
		value: ordinal,
		children: [
			jsx(SafeLink, {
				url: source.url,
				label: linkLabel(source.url, source.title),
				className: css$34.sourceLink
			}),
			source.snippet !== void 0 && source.snippet !== "" && jsx("div", {
				className: css$34.snippet,
				children: source.snippet
			}),
			source.publishedAt !== void 0 && source.publishedAt !== "" && jsx("div", {
				className: css$34.published,
				children: source.publishedAt
			})
		]
	});
}
/**
* The search card body: the answer over the full source list, which scrolls in
* place once it exceeds the `.sources` container height.
* @param props - see {@link WebSearchBlockProps}.
* @returns the search card element.
*/
function WebSearchBlock({ answer, sources, truncated, labels, className }) {
	const empty = (answer === void 0 || answer === "") && sources.length === 0;
	return jsxs("div", {
		className: clsx(css$34.block, className),
		"data-web": "search",
		children: [
			answer !== void 0 && answer !== "" && jsx("div", {
				className: css$34.answer,
				children: jsx(MarkdownText, {
					text: answer,
					labels: labels.markdown
				})
			}),
			empty ? jsx("div", {
				className: css$34.empty,
				children: labels.noResults
			}) : jsx("ol", {
				className: css$34.sources,
				children: sources.map((source, index) => jsx(SourceItem, {
					source,
					ordinal: index + 1
				}, index))
			}),
			truncated && jsx("div", {
				className: css$34.truncated,
				children: labels.sourcesTruncated
			})
		]
	});
}
/**
* The fetch card body: the linked URL and its HTTP status.
* @param props - see {@link WebFetchBlockProps}.
* @returns the fetch card element.
*/
function WebFetchBlock({ url, statusCode, truncated, labels, className }) {
	return jsxs("div", {
		className: clsx(css$34.block, css$34.fetch, className),
		"data-web": "fetch",
		children: [jsx(SafeLink, {
			url,
			label: url,
			className: css$34.fetchUrl
		}), jsxs("div", {
			className: css$34.fetchMeta,
			children: [jsxs("span", {
				className: css$34.status,
				children: [
					labels.http,
					" ",
					statusCode
				]
			}), truncated && jsx("span", {
				className: css$34.truncated,
				children: labels.contentTruncated
			})]
		})]
	});
}
/**
* Render a completed web retrieval as a structured card.
* @param props - see {@link WebBlockProps}; `kind` selects the search or fetch body.
* @returns the web card element.
*/
function WebBlock(props) {
	return props.kind === "search" ? jsx(WebSearchBlock, { ...props }) : jsx(WebFetchBlock, { ...props });
}
//#endregion
//#region lib/types/markdown/JsonBlock.js
const MAX_CHARS = 2e4;
function JsonBlock({ label, payload, defaultOpen = false, truncatedLabel }) {
	const [open, setOpen] = useState(defaultOpen);
	const body = useMemo(() => {
		if (!open) return "";
		let s;
		try {
			s = JSON.stringify(payload, null, 2) ?? String(payload);
		} catch {
			s = String(payload);
		}
		return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}\n${truncatedLabel(s.length)}` : s;
	}, [
		open,
		payload,
		truncatedLabel
	]);
	return jsxs("div", {
		className: css$35.root,
		children: [jsxs("button", {
			type: "button",
			className: css$35.toggle,
			onClick: () => {
				setOpen((v) => !v);
			},
			children: [
				open ? "▾" : "▸",
				" ",
				label
			]
		}), open && jsx("pre", {
			className: css$35.body,
			children: body
		})]
	});
}
//#endregion
//#region lib/types/markdown/plain-text.js
/**
* Markdown-to-plain-text projection for compact summaries and labels.
* Parsing shares the renderer's streaming GFM grammar ({@link parseGfm}), so
* the projection strips exactly the markup the renderer would draw; raw HTML
* stays literal, links keep their labels, images keep alt text, and code
* keeps its source text.
*/
function inlineText(node) {
	switch (node.type) {
		case "text":
		case "inlineCode":
		case "code": return node.value ?? "";
		case "image":
		case "imageReference": return node.alt ?? "";
		case "break": return "\n";
		case "html": return node.value ?? "";
		default: return node.children?.map(inlineText).join("") ?? "";
	}
}
function compactInline(text) {
	return text.replace(/\s+/g, " ").trim();
}
function blockText(node) {
	switch (node.type) {
		case "root":
		case "blockquote": return node.children?.map(blockText).filter(Boolean).join("\n\n") ?? "";
		case "paragraph":
		case "heading": return compactInline(inlineText(node));
		case "code": return node.value?.trim() ?? "";
		case "list": return node.children?.map(blockText).filter(Boolean).join("\n") ?? "";
		case "listItem": return node.children?.map(blockText).filter(Boolean).join(" ") ?? "";
		case "table": return node.children?.map(blockText).filter(Boolean).join("\n") ?? "";
		case "tableRow": return node.children?.map(blockText).join("	") ?? "";
		case "tableCell": return compactInline(inlineText(node));
		case "html": return node.value ?? "";
		case "thematicBreak":
		case "definition": return "";
		default: return compactInline(inlineText(node));
	}
}
function findFirstParagraph(node) {
	if (node.type === "paragraph") {
		const text = compactInline(inlineText(node));
		if (text !== "") return text;
	}
	for (const child of node.children ?? []) {
		const text = findFirstParagraph(child);
		if (text !== void 0) return text;
	}
}
function fullText(root) {
	return blockText(root).split("\n").map((line) => line.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
/**
* Parse GFM Markdown, remove its presentation markup, and preserve raw HTML literally.
* @param markdown - Markdown source.
* @param options - Optional extraction boundary.
* @returns Plain text for the whole document, first visible line, or first semantic paragraph.
*/
function extractMarkdownPlainText(markdown, options = {}) {
	const { mode = "all" } = options;
	const root = parseGfm(markdown);
	const all = fullText(root);
	switch (mode) {
		case "all": return all;
		case "first-line": return all.split("\n").find((line) => line !== "") ?? "";
		case "first-paragraph": return findFirstParagraph(root) ?? all.split("\n").find((line) => line !== "") ?? "";
	}
}
//#endregion
//#region lib/types/plugin-artwork.js
/**
* Fixed-palette plugin artwork for the plugin management surfaces. Unlike the
* ic_ds_* set these glyphs carry their own brand colors and gradients instead
* of riding currentColor; all draw on a 36×36 viewBox and take {size, className}.
*/
/**
* A per-instance SVG def id prefix: the artwork repeats across cards and rows,
* and duplicate document ids would make every `url(#…)` resolve to the first instance.
*/
const useArtworkId = () => `dsh_plugin_art_${useId().replaceAll(":", "")}`;
/** Light-blue terminal artwork shared by plugin cards and sidebar guide entries. */
const PluginArtworkTerminal = ({ size = 36, className }) => jsxs("svg", {
	width: size,
	height: size,
	className,
	viewBox: "0 0 36 36",
	fill: "none",
	xmlns: "http://www.w3.org/2000/svg",
	children: [jsx("path", {
		d: "M10 11L16.606 17.606C16.6841 17.6841 16.6841 17.8107 16.606 17.8888L10 24.4948",
		stroke: "#679EFE",
		strokeWidth: "3.5"
	}), jsx("path", {
		d: "M20.1211 24.4946H26.8685",
		stroke: "#679EFE",
		strokeWidth: "3.5"
	})]
});
/** Agent-loop plugin artwork (four leaves circling a center). */
const PluginArtworkLoop = ({ size = 36, className }) => {
	const uid = useArtworkId();
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 36 36",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		children: [
			jsx("path", {
				d: "M18.0486 28.4901C12.0858 28.4901 7.25195 23.6562 7.25195 17.6934C13.2148 17.6934 18.0486 22.5272 18.0486 28.4901Z",
				fill: "#A797FC"
			}),
			jsx("path", {
				d: "M18.0486 6.89667C12.0858 6.89667 7.25195 11.7305 7.25195 17.6934C13.2148 17.6934 18.0486 12.8595 18.0486 6.89667Z",
				fill: `url(#${uid}a)`
			}),
			jsx("path", {
				d: "M18.0485 28.4901C24.0114 28.4901 28.8452 23.6562 28.8452 17.6934C22.8824 17.6934 18.0485 22.5272 18.0485 28.4901Z",
				fill: "#4561EE"
			}),
			jsx("path", {
				d: "M18.0485 6.89667C24.0114 6.89667 28.8452 11.7305 28.8452 17.6934C22.8824 17.6934 18.0485 12.8595 18.0485 6.89667Z",
				fill: "#658EFF"
			}),
			jsx("defs", { children: jsxs("linearGradient", {
				id: `${uid}a`,
				x1: "16.7911",
				y1: "16.1655",
				x2: "8.98192",
				y2: "8.74289",
				gradientUnits: "userSpaceOnUse",
				children: [jsx("stop", { stopColor: "#A23AE7" }), jsx("stop", {
					offset: "1",
					stopColor: "#E2E2E2"
				})]
			}) })
		]
	});
};
/** Subagent plugin artwork (two stacked rounded squares); also marks every row inside a bundle. */
const PluginArtworkSubagent = ({ size = 36, className }) => {
	const uid = useArtworkId();
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 36 36",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		children: [
			jsx("rect", {
				x: "14.9893",
				y: "15.1877",
				width: "12.2365",
				height: "12.2365",
				rx: "2",
				fill: `url(#${uid}a)`,
				fillOpacity: "0.8"
			}),
			jsx("rect", {
				x: "8.87109",
				y: "9.0697",
				width: "12.2365",
				height: "12.2365",
				rx: "2",
				fill: `url(#${uid}b)`,
				fillOpacity: "0.8"
			}),
			jsxs("defs", { children: [jsxs("linearGradient", {
				id: `${uid}a`,
				x1: "21.1075",
				y1: "15.1877",
				x2: "21.1075",
				y2: "27.4243",
				gradientUnits: "userSpaceOnUse",
				children: [jsx("stop", { stopColor: "#45E7A4" }), jsx("stop", {
					offset: "1",
					stopColor: "#05909D"
				})]
			}), jsxs("linearGradient", {
				id: `${uid}b`,
				x1: "14.9894",
				y1: "9.0697",
				x2: "14.9894",
				y2: "21.3063",
				gradientUnits: "userSpaceOnUse",
				children: [jsx("stop", { stopColor: "#69B9FF" }), jsx("stop", {
					offset: "1",
					stopColor: "#324DE2"
				})]
			})] })
		]
	});
};
/**
* Web-search plugin artwork (conic-gradient ring and handle). SVG has no
* native conic gradient, so the ring clips an HTML div painted with CSS
* `conic-gradient` — the same emulation Figma exports; it renders inline in
* the browser UI but would stay empty in an `<img>` or mask context.
*/
const PluginArtworkSearch = ({ size = 36, className }) => {
	const uid = useArtworkId();
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 36 36",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		children: [
			jsx("path", {
				d: "M26.5362 26.9865L22.3813 22.8317",
				stroke: "#658EFF",
				strokeWidth: "3"
			}),
			jsx("g", {
				clipPath: `url(#${uid}ring)`,
				children: jsx("g", {
					transform: "matrix(0.0119394 -0.00173904 0.00173904 0.0119394 15.7661 16.2159)",
					children: jsx("foreignObject", {
						x: "-958.94",
						y: "-958.94",
						width: "1917.88",
						height: "1917.88",
						children: jsx("div", { style: {
							background: "conic-gradient(from 90deg, rgb(65, 225, 172) 0deg, rgb(101, 142, 255) 62.0619deg, rgb(65, 225, 172) 360deg)",
							height: "100%",
							width: "100%"
						} })
					})
				})
			}),
			jsx("defs", { children: jsx("clipPath", {
				id: `${uid}ring`,
				children: jsx("path", { d: "M21.9717 16.2159H19.9717C19.9717 18.5386 18.0888 20.4215 15.7661 20.4215V22.4215V24.4215C20.2979 24.4215 23.9717 20.7478 23.9717 16.2159H21.9717ZM15.7661 22.4215V20.4215C13.4434 20.4215 11.5605 18.5386 11.5605 16.2159H9.56055H7.56055C7.56055 20.7478 11.2343 24.4215 15.7661 24.4215V22.4215ZM9.56055 16.2159H11.5605C11.5605 13.8933 13.4434 12.0104 15.7661 12.0104V10.0104V8.01038C11.2343 8.01038 7.56055 11.6841 7.56055 16.2159H9.56055ZM15.7661 10.0104V12.0104C18.0888 12.0104 19.9717 13.8933 19.9717 16.2159H21.9717H23.9717C23.9717 11.6841 20.2979 8.01038 15.7661 8.01038V10.0104Z" })
			}) })
		]
	});
};
/** Default plugin artwork for plugins without one of their own (connector blocks and a node). */
const PluginArtworkDefault = ({ size = 36, className }) => {
	const uid = useArtworkId();
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		viewBox: "0 0 36 36",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		children: [jsx("path", {
			d: "M24.6294 8.63696C26.2862 8.63705 27.6294 9.98016 27.6294 11.637V12.7825C27.6292 14.4391 26.2861 15.7824 24.6294 15.7825H23.4839C22.6519 15.7825 21.5454 16.3459 21.5454 17.1778V18.1573C21.5454 18.7757 22.216 19.1966 22.8345 19.1965H24.6294C26.2861 19.1965 27.6292 20.5398 27.6294 22.1965V23.9924C27.6292 25.6491 26.2861 26.9924 24.6294 26.9924H22.8345C21.1778 26.9924 19.8347 25.649 19.8345 23.9924V22.1965C19.8345 21.7148 19.4957 21.2327 19.014 21.2327H16.4792C15.7975 21.2327 15.3374 22.0061 15.3374 22.6877V23.8333C15.3373 25.49 13.9942 26.8333 12.3374 26.8333H11.1919C9.53509 26.8333 8.19198 25.49 8.19189 23.8333V22.6877C8.19189 21.0309 9.53504 19.6877 11.1919 19.6877H12.3374C13.1964 19.6877 14.3999 19.0959 14.3999 18.2369V16.0185C14.3999 14.9518 15.2646 14.0872 16.3312 14.0872H19.435C20.0596 14.0872 20.484 13.4071 20.4839 12.7825V11.637C20.4839 9.98011 21.827 8.63696 23.4839 8.63696H24.6294ZM13.4116 11.2468C13.4116 12.6882 12.2431 13.8567 10.8018 13.8567C9.36037 13.8567 8.19189 12.6882 8.19189 11.2468C8.19189 9.80544 9.36037 8.63696 10.8018 8.63696C12.2431 8.63696 13.4116 9.80544 13.4116 11.2468Z",
			fill: `url(#${uid}a)`
		}), jsx("defs", { children: jsxs("linearGradient", {
			id: `${uid}a`,
			x1: "15.1481",
			y1: "9.94188",
			x2: "15.1481",
			y2: "13.6375",
			gradientUnits: "userSpaceOnUse",
			children: [jsx("stop", { stopColor: "#54ECE7" }), jsx("stop", {
				offset: "1",
				stopColor: "#658EFF"
			})]
		}) })]
	});
};
//#endregion
//#region lib/types/guide-artwork.js
/**
* Render fixed-palette artwork for a sidebar guide entry.
* @param props - canvas size and layout class supplied by the guide.
* @returns an ornamental SVG hidden from assistive technology.
*/
function GuideArtworkBrowser({ size = 36, className }) {
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		"aria-hidden": "true",
		viewBox: "0 0 36 36",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		children: [
			jsx("path", {
				d: "M17.9995 28.1465C23.6034 28.1465 28.1461 23.6038 28.1461 18C28.1461 12.3963 23.6034 7.85352 17.9995 7.85352C12.3958 7.85352 7.85303 12.3963 7.85303 18C7.85303 23.6038 12.3958 28.1465 17.9995 28.1465Z",
				stroke: "#539CFA",
				strokeWidth: "2"
			}),
			jsx("path", {
				d: "M8.57764 18H27.4211",
				stroke: "#539CFA",
				strokeWidth: "2",
				strokeLinecap: "square"
			}),
			jsx("path", {
				d: "M17.999 28.1467C20.0576 28.1467 21.6228 23.6039 21.6228 18C21.6228 12.3963 20.0576 7.85352 17.999 7.85352",
				stroke: "#539CFA",
				strokeWidth: "2"
			}),
			jsx("path", {
				d: "M17.9992 28.1467C15.9407 28.1467 14.3755 23.6039 14.3755 18C14.3755 12.3963 15.9407 7.85352 17.9992 7.85352",
				stroke: "#539CFA",
				strokeWidth: "2"
			})
		]
	});
}
/**
* Render fixed-palette artwork for a sidebar guide entry.
* @param props - canvas size and layout class supplied by the guide.
* @returns an ornamental SVG hidden from assistive technology.
*/
function GuideArtworkFiles({ size = 36, className }) {
	return jsxs("svg", {
		width: size,
		height: size,
		className,
		"aria-hidden": "true",
		viewBox: "0 0 36 36",
		fill: "none",
		xmlns: "http://www.w3.org/2000/svg",
		children: [jsx("path", {
			d: "M10.7603 27.922H24.6817C26.3441 27.922 27.1753 27.922 27.8102 27.5984C28.3687 27.3139 28.8228 26.8598 29.1074 26.3012C29.4309 25.6663 29.4309 24.8351 29.4309 23.1727V15.4936",
			stroke: "#FFCD78",
			strokeWidth: "1.97886"
		}), jsx("path", {
			d: "M13.1597 8.07812C13.4182 8.07818 13.6727 8.14336 13.8989 8.26855L16.7554 9.84961C16.9817 9.97485 17.2369 10.041 17.4956 10.041H26.106C26.9492 10.0412 27.6323 10.7251 27.6323 11.5684V24.5371C27.6323 25.3805 26.9483 26.0645 26.105 26.0645H8.09619C7.25281 26.0645 6.56884 25.3805 6.56885 24.5371V9.60449C6.56909 8.76133 7.25297 8.07812 8.09619 8.07812H13.1597ZM9.81592 14.5508V16.5293H24.3999V14.5508H9.81592Z",
			fill: "#FFBC4D"
		})]
	});
}
//#endregion
export { CodeBlock, FileTypeIcon, IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconCodeOutlineRegular, IconCopyOutlineRegular, IconSearchOutlineRegular, IconSettingsOutlineRegular, IconSparkleRegular, IconUserOutlineRegular, IconWrapLinesOutlineRegular, JsonTree, MarkdownText, StateDot, Tooltip, extractMarkdownPlainText, fileExtension, fileSizeText, writeClipboard };

//# sourceMappingURL=index.js.map