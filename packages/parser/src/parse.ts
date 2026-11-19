import { EditorAttributes } from '@onlook/constants';

import type { NodePath, T } from './packages';
import { getExistingOid } from './ids';
import { isReactFragment } from './helpers';
import { generate, parse, t, traverse } from './packages';

export function getAstFromContent(content: string): T.File | null {
    try {
        return parse(content, {
            sourceType: 'module',
            plugins: [
                'typescript',
                'jsx',
                ['decorators', { decoratorsBeforeExport: true }],
                'classStaticBlock',
                'dynamicImport',
                'importMeta',
            ],
        });
    } catch (e) {
        console.error(e);
        return null;
    }
}

/** Read one static text block from the exact source, including elements on the same line. */
export function getClientTextBlock(content: string, oid: string) {
    const ast = getAstFromContent(content);
    if (!ast) return null;
    const matches: {text:string;code:string;start:number;end:number}[] = [];
    let count = 0;
    traverse(ast,{ JSXElement(path) {
        const node = path.node;
        if (getExistingOid(node.openingElement.attributes)?.value !== oid) return;
        count++;
        for (let p: NodePath | null = path; p; p=p.parentPath) {
            if (!p.isJSXElement()) continue;
            const opening=p.node.openingElement;
            if (t.isJSXIdentifier(opening.name) && ['form','input','textarea','select','button'].includes(opening.name.name)) return;
            if (opening.attributes.some(a=>t.isJSXAttribute(a) && ['contentEditable','hidden','dangerouslySetInnerHTML'].includes(String(a.name.name)))) return;
        }
        const child=node.children[0];
        if (node.children.length!==1 || !t.isJSXText(child) || node.start==null || node.end==null || !node.loc) return;
        const text=child.value.replace(/\s+/g,' ').trim();
        if (text && text.length<=2500) matches.push({text,code:content.slice(node.start,node.end),start:node.loc.start.line,end:node.loc.end.line});
    }});
    return count===1 ? matches[0] ?? null : null;
}

export function getAstFromCodeblock(code: string, stripIds = false): T.JSXElement | undefined {
    const ast = getAstFromContent(code);
    if (!ast) {
        return;
    }
    if (stripIds) {
        removeIdsFromAst(ast);
    }
    const jsxElement = ast.program.body.find(
        (node) => t.isExpressionStatement(node) && t.isJSXElement(node.expression),
    );

    if (
        jsxElement &&
        t.isExpressionStatement(jsxElement) &&
        t.isJSXElement(jsxElement.expression)
    ) {
        return jsxElement.expression;
    }
}

export async function getContentFromAst(ast: T.File, originalContent: string): Promise<string> {
    return generate(
        ast,
        {
            retainLines: true,
            compact: false,
            comments: true,
            concise: false,
            minified: false,
            jsonCompatibleStrings: false,
            shouldPrintComment: () => true,
            retainFunctionParens: true,
        },
        originalContent,
    ).code;
}

export function removeIdsFromAst(ast: T.File) {
    traverse(ast, {
        JSXOpeningElement(path: NodePath<T.JSXOpeningElement>) {
            if (isReactFragment(path.node)) {
                return;
            }
            const attributes = path.node.attributes;
            const existingAttrIndex = attributes.findIndex(
                (attr: any) => attr.name?.name === EditorAttributes.DATA_ONLOOK_ID,
            );

            if (existingAttrIndex !== -1) {
                attributes.splice(existingAttrIndex, 1);
            }
        },
        JSXAttribute(path: NodePath<T.JSXAttribute>) {
            if (path.node.name.name === 'key') {
                const value = path.node.value;
                if (
                    t.isStringLiteral(value) &&
                    value.value.startsWith(EditorAttributes.ONLOOK_MOVE_KEY_PREFIX)
                ) {
                    return path.remove();
                }
            }
        },
    });
}
