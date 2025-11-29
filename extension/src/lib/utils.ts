import { mergeClasses } from "@fluentui/react-components";

/**
 * Compatibility shim for class name merging.
 * In Fluent UI v9, styles are defined using `makeStyles` and combined using `mergeClasses`.
 *
 * Usage:
 * const styles = useStyles();
 * <div className={cn(styles.root, isSelected && styles.selected)} />
 */
export const cn = mergeClasses;
