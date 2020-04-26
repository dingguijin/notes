import React from "react";
import classnames from "classnames";

export default function (props: any) {
  return (
    <span
      className={classnames({ "text-gray-500": props.element.touched })}
      {...props.attributes}
    >
      {props.children}
    </span>
  );
}